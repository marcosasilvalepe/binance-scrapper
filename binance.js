/***** 
    Each time Binance lists a new coin the value of it surges so this script checks if a new coin has been listed in Binance's website
    and if it's listed in Bittrex it buys the available balance of the new coin
*****/

/************************************ PUPPETEER AND MYSQL CONSTANTS **************************************/
const puppeteer = require('puppeteer');
const url = "https://www.binance.com/en/support/announcement/";
const twilio_account = 'my_twilio_account';
const twilio_token = 'twilio_token';
const client = require('twilio')(twilio_account, twilio_token);
const mysql = require('mysql');
const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "binance"
});

var iteration = 0;
/************************************ BITTREX CONSTANTS **************************************/
const request = require('request');
const CryptoJS = require("crypto-js");

const apiKey = "myAPIKey";
const apiSecret = "mySecretKey";

/************************************ PROGRAM FUNCTIONS **************************************/
function sendWhatsapp(msg) {
    client.messages.create({
        from: 'whatsapp:+14155238886',
        body: msg,
        to: 'whatsapp:+56968439779'
    }).then(/*message => console.log(message.sid)*/)
}

function buyCoin(coin, market, price, balance) {
    return new Promise((resolve, reject) => {
        //console.log(coin, market, price, balance);
        let quant = 2*(balance/price);
        let content = {
            "marketSymbol": coin + "-" + market,
            "direction": "BUY",
            "type": "MARKET",
            "quantity": quant,
            "timeInForce": "IMMEDIATE_OR_CANCEL",
            "useAwards": true
        };
        
        let timestamp = new Date().getTime();
        let contentHash = CryptoJS.SHA512(JSON.stringify(content)).toString(CryptoJS.enc.Hex);
        
        let uri = 'https://api.bittrex.com/v3/orders';
        let method = 'POST';
        let subaccountId = '';
        let preSign = [timestamp, uri, method, contentHash, subaccountId].join('');
        let signature = CryptoJS.HmacSHA512(preSign, apiSecret).toString(CryptoJS.enc.Hex);
        
        let options = {
            url: uri,
            json: true,
            headers: {
                'Content-Type': 'application/json',
                'Api-Key': apiKey,
                'Api-Timestamp': timestamp,
                'Api-Content-Hash': contentHash,
                'Api-Signature': signature
            },
            body: content
        }
        
        request.post(options, (error, res, body) => {
            if (error) { console.log(error); return; }
            if (res.statusCode == 201) {
                //console.log(body);
                var response = JSON.parse(body);
                sendWhatsapp("Just bought " + coin + " in Bittrex!!!!");
                setTimeout(function(){
                    resolve([true, parseFloat(response.fillQuantity)]);
                }, 1000);
            }
        });
    });
}

function checkCoinOnBittrex(coin, market) {
    return new Promise((resolve, reject) => {
        let content = '';
        let timestamp = new Date().getTime();
        let contentHash = CryptoJS.SHA512(content).toString(CryptoJS.enc.Hex);

        let uri = 'https://api.bittrex.com/v3/markets/' + coin + '-' + market + '/ticker';
        let method = 'GET';
        let subaccountId = '';
        let preSign = [timestamp, uri, method, contentHash, subaccountId].join('');
        let signature = CryptoJS.HmacSHA512(preSign, apiSecret).toString(CryptoJS.enc.Hex);

        let options = {
            url: uri,
            headers: {
                'Content-Type': 'application/json',
                'Api-Key': apiKey,
                'Api-Timestamp': timestamp,
                'Api-Content-Hash': contentHash,
                'Api-Signature': signature
            }
        }

        request.get(options, (error, res, body) => {
            if (error) { console.error("error:::" + error); reject([false, "error"]); }

            if (res.statusCode==404) {
                resolve([false, "Couldn't find coin in market..."])
            } else if (res.statusCode==200) {
                var response = JSON.parse(body);
                resolve([true, parseFloat(response.lastTradeRate)]);
            }
        });
    })
}

function getDataFromDb() {
    return new Promise((resolve, reject) => {
        pool.query("SELECT message, balance FROM binance LIMIT 1", function(err, result, fields) {
            if (err) throw err;
            var db_result = result[0].message.trim();
            var balance = result[0].balance;
            resolve([db_result, balance]);   
        });
    });
}

function recursion(browser) {
    return new Promise((resolve, reject) => {
        setTimeout(function(){
            resolve(run(browser));
        }, 40000)
    });
}
function delay(delayValue) { return new Promise(resolve => setTimeout(resolve, delayValue)); }

/************************************ MAIN FUNCTION **************************************/
async function run(browser) {
    try {

        const db_query = await getDataFromDb();
        const db_result = db_query[0];
        const balance = db_query[1];

        await console.log("Loading main page...")
        let page = await browser.newPage()
        page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Safari/537.36')
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 50000})
        await console.log("Page loaded...")
        await page.waitForTimeout(3000).then(/* () => console.log('Waited 3 seconds!') */)
        //await console.log("finished")

        const checkNewAnnouncement = await page.evaluate( () => {
            var newListing = document.querySelectorAll('a[data-bn-type="link"]');
            for (var i = 0; i < newListing.length; i++) {
                if (newListing[i].innerText=="New Crypto Listings") {
                    let nlParent = newListing[i].parentElement;
                    if (nlParent.querySelector('img')!==null) {
                        var aList = nlParent.nextElementSibling.className;
                        var lastNews = nlParent.parentElement.querySelector('.' + aList + ' > div > a:nth-child(1)');
                        if (lastNews!==null) {
                            return [lastNews.innerText.trim(), lastNews.getAttribute('href')];
                        }
                    }
                }
            }
        });
        const newAnnouncement = checkNewAnnouncement[0];
        await page.click('a[href="' + checkNewAnnouncement[1] + '"]');
        await page.waitForTimeout(4000).then(/* () => console.log('Waited 4 seconds!')*/ )
        const checkHour = await page.evaluate( (newAnnouncement) => {
            var textDiv = document.querySelectorAll('div[data-bn-type="text"]');
            for (let i = 0; i < textDiv.length; i++) {
                if (textDiv[i].innerText==newAnnouncement) {
                    let hourClassContainer = textDiv[i].nextElementSibling.className;
                    let publishedDate = textDiv[i].parentElement.querySelector('.' + hourClassContainer + ' > div:nth-child(2) > div:nth-child(2)').innerText;
                    return publishedDate;
                }
            }
        }, newAnnouncement);

        await page.close();
        await console.log('Waiting 10 seconds after closing tab....');
        await delay(10000);
        if (newAnnouncement===undefined) { /*await console.log("Something went wrong when evaluating inside the page... Returned undefined")*/ } 
        else {
            let now = new Date();
            let year = now.getFullYear();
            let month = 1 + now.getMonth(); if (month < 10) { month = "0" + month; }
            let day = now.getDate(); if (day < 10) { day = "0" + day; }
            let hours = now.getHours(); if (hours < 10) { hours = "0" + hours; }
            let minutes = now.getMinutes(); if (minutes < 10) { minutes = "0" + minutes; }
            let seconds = now.getSeconds(); if (seconds < 10) { seconds = "0" + seconds; }
            let dateTime = year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;

            await pool.query("UPDATE binance SET date='" + dateTime + "'", function(err, result, fields) {
                if (err) throw err;
                //console.log('Updated date in DB...')
            });

            if (db_result==newAnnouncement) { await console.log("No new announcements");  } 
            else {

                await pool.query("UPDATE binance SET message='" + newAnnouncement + "'", function(err, result, fields) {
                    if (err) throw err;
                    sendWhatsapp(newAnnouncement + '\r\n\r\nPublished: ' + checkHour);
                });

                var first_split = newAnnouncement.split(" ");
                if (first_split.includes("Lists")) {

                    let publishedDateSplit = checkHour.split(" ");
                    let publishedHour = publishedDateSplit[1];
                    let publishedHourSplit = publishedHour.split(":");
                    let pHours = parseInt(publishedHourSplit[0]) * 60;
                    let pMinutes = parseInt(publishedHourSplit[1]);

                    let publishedHourSum = pHours + pMinutes;
                    let nowHourSum = (now.getMinutes() + (60 * now.getHours()));
                    let hourDifference = nowHourSum - publishedHourSum;

                    var shouldIBuy;
                    if (hourDifference < 4) { shouldIBuy = true; }
                    else { shouldIBuy = false; }

                    if (shouldIBuy) {
                        var second_split = newAnnouncement.split(")");
                        var second_split_result = second_split[0];
                        var third_split = second_split_result.split("(");
                        var new_coin_symbol = third_split[1];
                        //await console.log(new_coin_symbol);

                        //CHECK COIN IN BITTREX!!!!
                        var checkUSDT = await checkCoinOnBittrex(new_coin_symbol, 'USDT');
                        if (checkUSDT[0]) {
                            //BUY COIN IN USDT
                            //await console.log(checkUSDT[1])
                            await buyCoin(new_coin_symbol, 'USDT', checkUSDT[1], balance);
                            return;
                        } else {
                            //await console.log("Couldn't find in USDT...Gonna check in BTC market.")
                            var checkBTC = await checkCoinOnBittrex(new_coin_symbol, 'BTC');
                            if (checkBTC[0]) {
                                //BUY COIN IN BTC
                                //console.log(checkBTC[1])
                                var price_query = await checkCoinOnBittrex('BTC', 'USDT');
                                var BTCprice = price_query[1];
                                var buyBTC = await buyCoin('BTC', 'USDT', BTCprice, balance);
                                if (buyBTC[0]) {
                                    await buyCoin(new_coin_symbol, 'BTC', checkBTC[1], buyBTC[1]);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    } 
    catch (e) { 
        console.log("Error in Main Function: ", e.message);
        await browser.close();
        browser = null;
        await delay(10000);
        browser =  await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreHTTPSErrors: true
        });// default is true
        await delay(10000);
    }
    finally {
        var numberOfOpenPages = (await browser.pages()).length;
        console.log("Open tabs=", numberOfOpenPages);
        iteration++;
        console.log("---------------------- ITERATION: " + iteration + " --------------------\r\n") 
        await recursion(browser);
    }
}
async function main() {
    var browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ignoreHTTPSErrors: true
    });// default is true
    await run(browser);
}
main();
