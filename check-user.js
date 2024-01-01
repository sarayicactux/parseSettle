const moment = require("moment-jalaali")
const today = moment().format("jYYYYjMMjDD");
const checkUserDebt = async(username) => {
    const installmentsUser = installments.find({username, status : "0", "maturities.status" : "0", $lte : ["$maturities.payDate", +today]}).toArray();
    console.group(installmentsUser)
}
checkUserDebt("09332255768")