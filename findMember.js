
module.exports = async function (shares = []) {
    try {
        for (const share of shares) {
            const member = await cards.findOne({card_number : share.account});
            require("fs").appendFileSync("./shareDetails.log",JSON.stringify({
            username : member?.username,
            name: member.first_name + " " + member.last_name,
            card_numbr : share.account,
            amount : share.amount
            },null, 4) , "utf-8");
        }
    } catch (error) {
        console.log(error)
    }
}