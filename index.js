const puppeteer = require('puppeteer');
const fs = require('fs');
async function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
 }

const parseJsonData = async (parsedData) => {

    return new Promise(async(resolve, reject) => {
        const extractTimestamp = (text) => {
        
            let time = "";
            let date = "";
            try {
                const reg =  /\[([0-9]{1,2}\:[0-9]{1,2}\s(AM|PM)),\s([0-9]{2}\/[0-9]{2}\/[0-9]{4})\]/;
                const timeanddate = text.match(reg);
                time = timeanddate[1];
                date = timeanddate[3]; 
            } catch (error) {
                
            } 
            return {time, date};
        }
        
        const extractDetails = (text) => {
            
            const phoneStartIndex = text.indexOf('+');
            const phone = text.substring(phoneStartIndex, phoneStartIndex+16);
            const name = text.substring(0, phoneStartIndex-1);
            const message = text.substring(phoneStartIndex+16, text.length);
            return {phone, name, message};
        
        
        }

        const redis = require('redis');
        const client = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });

        client.on('error', (err) => {
            console.log("Error " + err);
        });
        client.connect();

        const postAndValidate = async (preparedObject) => {
            return new Promise(async(resolve, reject) => {
                const hasKey = await client.get(preparedObject.phone);
                if(hasKey != 1){
                    console.log('new user found' + preparedObject.phone);
                    //post data to api endpoint
                    client.set(preparedObject.phone, 1);
                    client.expire(preparedObject.phone, 60*60*24);
                } else {
                    console.log('old user found' + preparedObject.phone);
                    client.expire(preparedObject.phone, 60*60*24);
                }
                resolve();
            });
        }
        
        const promiseArray = [];
        parsedData.forEach((message) => {
            if(message.text.indexOf('joined via an invite link') === -1) 
            {
                let preparedObject = {}
                preparedObject = {...preparedObject, ...extractTimestamp(message.timestamp)};
                preparedObject = {...preparedObject, ...extractDetails(message.text)};
                //console.log(preparedObject);
                promiseArray.push(postAndValidate(preparedObject));
            }
        });

        Promise.all(promiseArray).then(() => {
            client.quit();
            resolve();
        });
    
    });
}



 (async () => {

    try {
    const groupsToScan = process.argv[2].split(',');
    const browserWSEndpoint =  process.env.WS_URL || 'ws://127.0.0.1:2500/devtools/browser/ec96b0ca-3d69-4306-9fa8-38430db8eaab';
    const browser = await puppeteer.connect({ browserWSEndpoint });
    const page = await browser.newPage();
  
    await page.goto('https://web.whatsapp.com');
  
    // Wait for the chat selector to appear, but don't block for too long
    const SELECTOR_CHAT_FIRST = '#pane-side [role=row] div:nth-child(1)';
    const chatSelector = await page.waitForSelector(SELECTOR_CHAT_FIRST, { timeout: 20000 }).catch(() => null);
    
    let activeElement = await page.evaluate(() => document.activeElement);
    if (chatSelector) {
      groupsToScan.forEach(async (groupToScan) => {
        await chatSelector.click();
        while(true){
            await page.keyboard.press('Tab');
            await delay(1000);
            console.log('pressing tab');    
            activeElement = await page.evaluate(() => document.activeElement);
            const role = await page.evaluate(() => document.activeElement.getAttribute('role'));
            if(role == 'row'){
                console.log('reached here to break - found the active element with role row');
                break;
                
            }
        }
        //document.querySelectorAll('#pane-side [role=row]')[10].querySelector('[role=gridcell] span').innerText
        
        let group_name = '';
        while(true){
            group_name = await page.evaluate(() => document.activeElement.querySelector('[role=gridcell] span')?.innerText || '');
            console.log('group name is ' + group_name);
            if(group_name == groupToScan){
                console.log('reached here to break - found the group');
                await page.keyboard.press('Enter');
                break;
                
            }
            await page.keyboard.press('ArrowDown');
            await delay(1000);
        }


        const messages = await page.evaluate(async() => {
        
            async function delay(time) {
                return new Promise(function(resolve) { 
                    setTimeout(resolve, time)
                });
            }

            const messagesToScan = 200;
            let messagesLength = 0;
            var today = new Date().getDate();

            while(true){
                console.log('evaluate')
                const SELECTOR_CHAT_INPUT = '._5kRIK';
                document.querySelector(SELECTOR_CHAT_INPUT).scrollTo(0,200);
                await delay(1000);
                console.log('scroll')
                messagesLength = document.querySelector('._5kRIK').querySelectorAll('[role=row]').length;
                console.log('messages length is ' + messagesLength);
                if(messagesLength > messagesToScan){
                    console.log('reached here to break - found enough messages to scan');
                    break;
                }

                
            }
            const msgs = [];
            document.querySelector('._5kRIK').querySelectorAll('[role=row]').forEach((el) => {
                let timestamp = "";
                if(el.querySelector('._1DETJ.copyable-text'))
                {
                    timestamp = el.querySelector('._1DETJ.copyable-text').getAttribute('data-pre-plain-text');
                }
                msgs.push({"text":el.innerText, "timestamp":timestamp});
            });
            return msgs;
        });

        await parseJsonData(messages);
        console.log('done with group ' + group_name);

    });
    // console.log(messages);
    // fs.writeFile(group_name + '.json', JSON.stringify(messages), (err) => {
    //     if (err) throw err;
    //     console.log('The file has been saved!');
    //     }
    // );


    
    } else {
      console.log('Chat selector not found within the timeout.');
    }
} catch (error) {
    console.log(error);
}
    //await browser.close();
})();