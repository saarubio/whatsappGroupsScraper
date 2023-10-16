const puppeteer = require('puppeteer');
const fs = require('fs');
const AirTableHelper = require('./integrations/airtable/index.js');
const RedisHelper = require('./integrations/redis/index.js');

require('dotenv').config();

async function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
 }

const parseArgs = () => {

    // -g group1,group2,group3
    // -t text file name
    // -a airtable
    // -u unique users only (no duplicates)
    // -h help
    const optionsFromArgs = {};
    const args = process.argv.slice(2);
    
    args.forEach((arg) => {
        // let's split only if possible to split
        if(arg.indexOf('=') != -1){
            const argSplit = arg.split('=');
            optionsFromArgs[argSplit[0].replace('-','')] = argSplit[1];
        } else {
            optionsFromArgs[arg.replace('-','')] = true;
        }
    });
    return optionsFromArgs;
}


const parseJsonData = async (parsedData,groupName) => {

   
    const args = parseArgs();

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
            const phone = text.substring(phoneStartIndex, phoneStartIndex+16).replace(' ','');
            const name = text.substring(0, phoneStartIndex-1);
            const message = text.substring(phoneStartIndex+16, text.length);
            return {phone, name, message};
        
        
        }

        
        const dumpObject = async (DataObject) => {

            if(args.a){ // airtable
                const helper = new AirTableHelper();
                await helper.createRecord({
                    "name":DataObject.name,
                    "phone":DataObject.phone,
                    "groupName":groupName,
                });
            }
            if(args.t){ // text file
               await fs.appendFileSync(args.t, JSON.stringify(DataObject) + '\n');
            }

        };

        const postAndValidate = async (preparedObject) => {

            
            return new Promise(async(resolve, reject) => {

                if(args.u){ // unique users only , depends on redis
                    const redisHelper = new RedisHelper();
                    const hasKey = await redisHelper.contactExists(preparedObject.phone);
                    if(hasKey != 1){
                        console.log('new user found' + preparedObject.phone);
                        await dumpObject(preparedObject);
                        await redisHelper.storeContact(preparedObject.phone);
                    } else {
                        console.log('old user found' + preparedObject.phone);
                    }
                }
                else 
                {
                    await dumpObject(preparedObject); // everyone
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
                promiseArray.push(postAndValidate(preparedObject));
            }
        });

        Promise.all(promiseArray).then(() => {
            resolve();
        });
    });
}




 (async () => {

    const DELAY_TIME = 1000;
    const args = parseArgs();
    if(args.h) {
        console.log('-g group1,group2,group3');
        console.log('-t text file name');
        console.log('-a airtable');
        console.log('-u unique users only (no duplicates)');
        console.log('-h help');
        process.exit();
        return;
    }
    try {
        const groupsToScan = args.g.split(',');
        const browserWSEndpoint =  process.env.WS_URL || 'ws://127.0.0.1:2500/devtools/browser/ec96b0ca-3d69-4306-9fa8-38430db8eaab';
        const browser = await puppeteer.connect({ browserWSEndpoint });
        const page = await browser.newPage();

        await page.goto('https://web.whatsapp.com');
    
        // Wait for the chat selector to appear, but don't block for too long
        const SELECTOR_CHAT_FIRST = '#pane-side [role=row] div:nth-child(1)';
        const chatSelector = await page.waitForSelector(SELECTOR_CHAT_FIRST, { timeout: 20000 }).catch(() => null);
        
        let activeElement = await page.evaluate(() => document.activeElement);
        
        if (chatSelector) {
        
        const scanGroup = async (activeGroupIndex = 0) => {

            const scanNextGroup = async () => {
                activeGroupIndex++;
                if(activeGroupIndex < groupsToScan.length-1){
                    await scanGroup(activeGroupIndex+1);
                } else {
                    await scanGroup(0);
                }
            }

            const groupToScan = groupsToScan[activeGroupIndex];
            await chatSelector.click();
            while(true){
                await page.keyboard.press('Tab');
                await delay(DELAY_TIME);
                console.log('pressing tab');    
                activeElement = await page.evaluate(() => document.activeElement);
                const role = await page.evaluate(() => document.activeElement.getAttribute('role'));
                if(role == 'row'){
                    console.log('reached here to break - found the active element with role row');
                    break;
                    
                }
            }

            let groupScanCounter = 0;
            let group_name = '';
            while(true){
                group_name = await page.evaluate(() => document.activeElement.querySelector('[role=gridcell] span')?.innerText || '');
                console.log('group name is ' + group_name);
                if(group_name == groupToScan){
                    console.log('reached here to break - found the group');
                    await page.keyboard.press('Enter');
                    break;
                    
                }
                groupScanCounter++;
                if(groupScanCounter > 10){
                    console.log('reached here to break - group not found');
                    return await scanNextGroup();
                    
                }
                await page.keyboard.press('ArrowDown');
                await delay(DELAY_TIME);
            }


            const messages = await page.evaluate(async() => {

                const DELAY_TIME = 1000;
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
                    await delay(DELAY_TIME);
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

            await parseJsonData(messages,group_name);
            console.log('done with group ' + group_name);
            // after finish we start again endless loop
            return await scanNextGroup();
        }
        await scanGroup();

    } else {
      console.log('Chat selector not found within the timeout.');
    }
} catch (error) {
    console.log(error);
}
    //await browser.close();
})();