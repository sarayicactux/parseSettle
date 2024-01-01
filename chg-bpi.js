const fs = require("fs");
const path = require("path");
const soap = require("soap");
const crypto = require("crypto");
const RSAXML = require("rsa-xml");
const moment = require("moment-jalaali");
const qs = require('qs');
const axios = require('axios').default;


const veryOldCardsSettlement = async (CardPANs, Amounts) => {
  console.log(CardPANs, Amounts, 'old-cards');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const xmlKey = fs.readFileSync(
    path.resolve(__dirname, "./bpi-pvt-key.xml"),
    "utf-8"
  );
  const key = new RSAXML().exportPemKey(xmlKey);
  let sign = crypto.createSign("RSA-SHA1");

  let request = JSON.stringify({
    Username: "13855229service",
    AccountCode: "13859169574",
    SourceDepositNumber: "233.8100.13855229.1",
    OrganizationCode: "13859169576",
    CardPANs,
    Amounts,
    Timestamp: moment().format("YYYY/MM/DD HH:mm:ss:SSS"),
  }).replace(/\//g, "\\/");

  sign.update(request);
  signature = sign.sign(key, "base64");

  let wsdlURL = "https://ib.bpi.ir/WebServices/UserServices.asmx?WSDL";
  let args = { request, signature };
  let client = await soap.createClientAsync(wsdlURL, {
    endpoint: "https://ib.bpi.ir/WebServices/UserServices.asmx",
  });
  let soapResult = await client.ChargeOrganizationBonCardsAsync(args);
  return JSON.parse(soapResult[0]["ChargeOrganizationBonCardsResult"]);
}

const newCardsSettlement = async (CardPANs, Amounts) => {
  try {
    console.log(CardPANs, Amounts, 'new-cards');

    const data = qs.stringify({
      'scProductId': '1862020',
      'scApiKey': 'a9aff6e3a4ee4435942bc2bad42a8a52',
      'body': JSON.stringify({ "CustomerNumber": "13855229", "OrganizationCode": "1987", "CardNumbers": CardPANs, "Amounts": Amounts, "DepositNumber": "233.8100.13855229.1", "RoutingAccountId": "29215750244", "routingAccountNumber": "233.7600.13855229.2", "FeePayType": 6 }),
      'CustomerNumber': '13855229'
    }, { encode: false });

    const config = {
      method: 'post',
      url: 'https://api.pod.ir/srv/sc/nzh/doServiceCall',
      headers: {
        '_token_': 'ba31c9411a164328a46494b4615e720a',
        '_token_issuer_': '1',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': 'JSESSIONID=node01bhbi90yefkwq1w9hrqrclvv421046930.node0'
      },
      data: data
    };

    const requestRes = await axios(config);
    console.log(requestRes.data, 'res-new')

    return { IsSuccess: requestRes.data?.hasError == false };


  } catch (error) {
    console.log(error);
    return { IsSuccess: false };
  }
}

const oldCardsSettlement = async (CardPANs, Amounts) => {
  try {
    console.log(CardPANs, Amounts, 'old-cards');


    const data = qs.stringify({
      'scProductId': '1862020',
      'scApiKey': 'a9aff6e3a4ee4435942bc2bad42a8a52',
      'body': JSON.stringify({ "CustomerNumber": "13855229", "OrganizationCode": "1637", "CardNumbers": CardPANs, "Amounts": Amounts, "DepositNumber": "233.8100.13855229.1", "RoutingAccountId": "29215750244", "routingAccountNumber": "233.7600.13855229.1", "FeePayType": 6 }),
      'CustomerNumber': '13855229'
    }, { encode: false });

    console.log(data, 'data-test')
    const config = {
      method: 'post',
      url: 'https://api.pod.ir/srv/sc/nzh/doServiceCall',
      headers: {
        '_token_': 'ba31c9411a164328a46494b4615e720a',
        '_token_issuer_': '1',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': 'JSESSIONID=node01bhbi90yefkwq1w9hrqrclvv421046930.node0'
      },
      data: data,

    };

    const requestRes = await axios(config);
    console.log(requestRes.data, 'res-old');

    return { IsSuccess: requestRes.data?.hasError == false };


  } catch (error) {
    console.log(error);
    return { IsSuccess: false };
  }
}

module.exports = async function (CardPANs, Amounts) {
  //50222940 old
  //50222914 new

  const oldCardsPans = [];
  const oldCardsAmounts = [];

  const newCardsPans = [];
  const newCardsAmounts = [];

  let finalResult = false;

  CardPANs.map((item, index) => {
    if (item[7] == 0) {

      oldCardsPans.push(item + "");
      oldCardsAmounts.push(Amounts[index] + "");

    } else if (item[7] == 4) {
      newCardsPans.push(item + "");
      newCardsAmounts.push(Amounts[index] + "");
    }
  });

  const oldCardsSettlementResult = await oldCardsSettlement(oldCardsPans, oldCardsAmounts);
  console.log(oldCardsSettlementResult, 'oldCardResult');

  if (newCardsAmounts.length && oldCardsSettlementResult.IsSuccess) {
    const newCardsSettlementResult = await newCardsSettlement(newCardsPans, newCardsAmounts);
    console.log(newCardsSettlementResult, 'newCardResult');
    // if (newCardsSettlementResult.IsSuccess) finalResult = true;
  }

  if (oldCardsSettlementResult.IsSuccess) finalResult = true;


  return { IsSuccess: finalResult };

};
