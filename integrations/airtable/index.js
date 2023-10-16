const Airtable = require('airtable');
require('dotenv').config();
// sample class 
class  AirTableHelper {

    // let's construct using our api key
    static base = process.env.AIRTABLE_BASE;
    static apiKey = process.env.AIRTABLE_SECRET;
    constructor(apiKey, baseId) {
        this.base = new Airtable({apiKey: AirTableHelper.apiKey}).base(AirTableHelper.base);
    }    

    async createRecord(table, data) {
        return new Promise((resolve, reject) => {
            this.base(table).create(data, (err, record) => {
                if (err) { console.error(err); return; }
                console.log(record.getId());
                resolve(record);
            });
        });
    }

    // let's create a new record

}

module.exports = AirTableHelper;


