// Only these exact, attribute-free inline tags become markup. Everything else
// stays escaped text, including scripts, images, links and event attributes.
const INLINE_TAG = /(<\/?(?:strong|b|em|i|code)\s*>|<br\s*\/?>)/gi;
const escapeText = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
const canonical = { strong: 'strong', b: 'strong', em: 'em', i: 'em', code: 'code' };
export function formatQuestionText(value) {
  const stack = [];
  let html = '';
  for (const token of String(value ?? '').split(INLINE_TAG)) {
    const tag = /^<(\/?)(strong|b|em|i|code|br)\s*\/?>$/i.exec(token);
    if (!tag) { html += escapeText(token).replace(/\r\n?|\n/g, '<br>');continue; }
    const name = tag[2].toLowerCase();
    if (name === 'br') { html += '<br>';continue; }
    const element = canonical[name];
    if (!tag[1]) { stack.push(element);html += `<${element}>`; }
    else {
      const index = stack.lastIndexOf(element);
      if (index >= 0) while (stack.length > index) html += `</${stack.pop()}>`;
    }
  }
  while (stack.length) html += `</${stack.pop()}>`;
  return html;
}
export function plainQuestionText(value) {
  return String(value ?? '').split(INLINE_TAG).map(token => /^<br\s*\/?>$/i.test(token) ? '\n' : /^<\/?(?:strong|b|em|i|code)\s*>$/i.test(token) ? '' : token).join('');
}
