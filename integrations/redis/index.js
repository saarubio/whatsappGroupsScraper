const redis = require('redis');
require('dotenv').config();


class RedisHelper {

    static client = null;
    constructor() {
        if(RedisHelper.client == null)
        {
            RedisHelper.client =  redis.createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379'
            });
            RedisHelper.client.on('error', (err) => {
                console.log("Error " + err);
            });
            RedisHelper.client.connect();
        }
    }

    storeContact(phone) {
        return new Promise(async(resolve, reject) => {
            try {
                await RedisHelper.client.set(phone, 1);
                await RedisHelper.client.expire(phone, 60*60*24);
                resolve(true);
            } catch (error) {
                reject(error);
            }
        });
    }

    contactExists(phone) {
        return new Promise(async(resolve, reject) => {
            try {
                const hasKey = await RedisHelper.client.get(phone);
                resolve(hasKey); 
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = RedisHelper;