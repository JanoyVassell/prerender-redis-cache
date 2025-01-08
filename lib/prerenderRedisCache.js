
const redis = require('redis');

const retryAttempts = 10;
const retryPeriod = 10000;
const TTL = 86400;

const client = redis.createClient({
    socket: {
      reconnectStrategy: function(retries) {
          if (retries > retryAttempts) {
              console.log("Too many attempts to reconnect. Redis connection was terminated. Check services.");
              return new Error("Too many retries.");
          } else {
              return retries * retryPeriod;
          }
      },
      connectTimeout: 5000
    }
  });

client.on('error', err => console.log('Redis Client Error', err));
client.connect();

/**
 * Basic Config Variables
 * redis_url (string) - Redis hostname (defaults to localhost)
 * ttl (int) - TTL on keys set in redis (defaults to 1 day)
 */
// var REDIS_URL = process.env.REDISTOGO_URL ||
//     process.env.REDISCLOUD_URL ||
//     process.env.REDISGREEN_URL ||
//     process.env.REDIS_URL ||
//     'redis://127.0.0.1:6379';

// var url = require('url');
// var TTL = process.env.PAGE_TTL || 86400;

// // Parse out the connection vars from the env string.
// var connection = url.parse(REDIS_URL);
// var redis = require('redis');
// var client = redis.createClient(connection.port, connection.hostname);
// var redisOnline = false;

const STATUS_CODES_TO_CACHE = {
    200: true,
    203: true,
    204: true,
    206: true,
    300: true,
    301: true,
    404: true,
    405: true,
    410: true,
    414: true,
    501: true
};

// Parse out password from the connection string
// if (connection.auth) {
//     client.auth(connection.auth.split(':')[1]);
// }

// Make redis connection
// Select Redis database, parsed from the URL
// connection.path = (connection.pathname || '/').slice(1);
// connection.database = connection.path.length ? connection.path : '0';
// client.select(connection.database);

// // Catch all error handler. If redis breaks for any reason it will be reported here.
// client.on('error', function (error) {
//     console.warn('Redis Cache Error: ' + error);
// });

// client.on('ready', function () {
//     redisOnline = true;
//     console.log('Redis Cache Connected');
// });

// client.on('end', function () {
//     redisOnline = false;
//     console.warn(
//         'Redis Cache Conncetion Closed. Will now bypass redis until it\'s back.'
//     );
// });

module.exports = {
    requestReceived: function (req, res, next) {

        if (req.method !== 'GET' ) {
            console.log("Method: ", req.method);
            return next();
        }
        let result = client.get(req.prerender.url);

        result.then(function(parsedResult){  
            if(parsedResult !== null ) {
                let response = JSON.parse(parsedResult);
                let headers = response.headers;
                let key;

                for (key in headers) {
                    if(headers.hasOwnProperty(key) && !/[^\t\x20-\x7e\x80-\xff]/.test(headers[key])) {
                        res.setHeader(key, headers[key]);
                    }
                }
                res.send(response.statusCode, response.content);
            } else {
                next();
            }
        });
    },

    pageLoaded: function (req, res, next) {
        if (!STATUS_CODES_TO_CACHE[req.prerender.statusCode]) {
            return next();
        }

        let key = req.prerender.url;
        let response = {
            statusCode: req.prerender.statusCode,
            content: req.prerender.content.toString(),
            headers: req.prerender.headers
        };
        let reply = client.set(key, JSON.stringify(response));

        if (reply !== null && TTL) {
            let ttlResponse = client.expire(key, TTL);
            if( ttlResponse == 0 ) {
                console.warn('Could not set expiry for "' + key + '"');
            } 
        }

        next();
    }
};
