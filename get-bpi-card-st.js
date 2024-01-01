const fs = require("fs");
const path = require("path");
const soap = require("soap");
const crypto = require("crypto");
const RSAXML = require("rsa-xml");
const moment = require("moment-jalaali");
const qs = require('qs');
const axios = require('axios').default;

const oldSettlement = async () => {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const xmlKey = fs.readFileSync(
      path.resolve(__dirname, "./bpi-pvt-key.xml"),
      "utf-8"
    );
    const key = new RSAXML().exportPemKey(xmlKey);
    let sign = crypto.createSign("RSA-SHA1");

    let request = JSON.stringify({
      Username: "13855229service",
      Timestamp: moment().format("YYYY/MM/DD HH:mm:ss:SSS"),
      CardPAN,
      OrganizationCode: "13859169576",
    }).replace(/\//g, "\\/");

    sign.update(request);
    signature = sign.sign(key, "base64");

    let wsdlURL = "https://ib.bpi.ir/WebServices/UserServices.asmx?WSDL";
    let args = { request, signature };
    let client = await soap.createClientAsync(wsdlURL, {
      endpoint: "https://ib.bpi.ir/WebServices/UserServices.asmx",
    });
    let soapResult = await client.GetOrganizationBonCardStateAsync(args);
    return JSON.parse(soapResult[0]["GetOrganizationBonCardStateResult"]);
  } catch (error) {
    console.log(error)
    return {}
  }
}

module.exports = async function (CardPAN) {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const data = qs.stringify({
      'scProductId': '3024588',
      'body': JSON.stringify({ "CustomerNumber": "13855229", "OrganizationId": CardPAN[7] == 0 ? "13859169576" : "29215750246", "CardNumber": CardPAN }),
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
    const result = JSON.parse(requestRes?.data?.result?.result);
    console.log(CardPAN, result, 'result')

    return { Data: [{ CardState: result?.ResultData ? result?.ResultData?.CardState : 0 }] };
  } catch (error) {
    console.log(error, 'cardError', CardPAN)
    return {}
  }
};
