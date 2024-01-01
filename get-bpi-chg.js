const fs = require("fs");
const path = require("path");
const soap = require("soap");
const crypto = require("crypto");
const RSAXML = require("rsa-xml");
const moment = require("moment-jalaali");

module.exports = async function (
  ChargeDateFrom = moment().format("YYYY/MM/DD"),
  ChargeDateTo = moment().format("YYYY/MM/DD"),
  FirstResult = 0,
  MaxResult = 50
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const xmlKey = fs.readFileSync(
    path.resolve(__dirname, "./bpi-pvt-key.xml"),
    "utf-8"
  );
  const key = new RSAXML().exportPemKey(xmlKey);
  let sign = crypto.createSign("RSA-SHA1");

  let request = JSON.stringify({
    Username: "13855229service",
    ChargeDateFrom,
    ChargeDateTo,
    AccountCode: "13859169574",
    FirstResult,
    MaxResult,
    OrganizationCode: "13859169576",
    Timestamp: moment().format("YYYY/MM/DD HH:mm:ss:SSS"),
  }).replace(/\//g, "\\/");

  sign.update(request);
  signature = sign.sign(key, "base64");

  let wsdlURL = "https://ib.bpi.ir/WebServices/UserServices.asmx?WSDL";
  let args = { request, signature };

  let client = await soap.createClientAsync(wsdlURL, {
    endpoint: "https://ib.bpi.ir/WebServices/UserServices.asmx",
  });
  let soapResult = await client.GetOrganizationBatchChargeReportAsync(args);
  console.log(JSON.stringify(JSON.parse(soapResult[0]["GetOrganizationBatchChargeReportResult"]), null, 4));

  return JSON.parse(soapResult[0]["GetOrganizationBatchChargeReportResult"]);
};
