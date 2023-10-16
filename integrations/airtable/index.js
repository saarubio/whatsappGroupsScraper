const Airtable = require('airtable');
require('dotenv').config();


/**
 * Airtable helper class
 */
class  AirTableHelper {

    // let's construct using our api key
    static base = process.env.AIRTABLE_BASE;
    static apiKey = process.env.AIRTABLE_SECRET;
    static table = process.env.AIRTABLE_TABLE;
    constructor(apiKey, baseId) {
        this.base = new Airtable({apiKey: AirTableHelper.apiKey}).base(AirTableHelper.base);
    }    
    /**
     * 
     * @param {*} data 
     * @returns Promise
     */
    async createRecord(data) {
        return new Promise((resolve, reject) => {
            this.base(AirTableHelper.table).create(data, (err, record) => {
                if (err) { console.error(err); return; }
                console.log(record.getId());
                resolve(record);
            });
        });
    }
}

module.exports = AirTableHelper;


