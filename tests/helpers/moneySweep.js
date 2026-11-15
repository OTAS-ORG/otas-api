const MONEY_CONTENT = /MMK|ကျပ်|သိန်း|သောင်း|သန်း|THB|ဘတ်|USD|\$/i;
const assertMoneyFree = (body) => {
  if (MONEY_CONTENT.test(JSON.stringify(body))) throw new Error('Money content found in restricted response');
};
module.exports = { assertMoneyFree };
