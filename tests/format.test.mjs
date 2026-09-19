import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatQuestionText, plainQuestionText} from '../question-format.js';

test('supported inline HTML becomes formatted text in question content', () => {
  assert.equal(formatQuestionText('确定 <strong>Sprint Goal</strong>。'), '确定 <strong>Sprint Goal</strong>。');
  assert.equal(formatQuestionText('<B>加粗</B><br/>换行\n<em>斜体</em>'), '<strong>加粗</strong><br>换行<br><em>斜体</em>');
  assert.equal(plainQuestionText('确定 <strong>Sprint Goal</strong><br>目标'), '确定 Sprint Goal\n目标');
});

test('executable tags and attributes remain escaped text', () => {
  for (const text of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<strong onclick="alert(1)">text</strong>', '<svg/onload=alert(1)>', '</h1><button>fake</button>']) {
    const formatted = formatQuestionText(text);
    assert.equal(/<(?:script|img|svg|button|\/h1)|<strong\s/i.test(formatted), false);
    assert.ok(formatted.includes('&lt;'));
  }
  assert.equal(formatQuestionText('x < 3 && y > 4'), 'x &lt; 3 &amp;&amp; y &gt; 4');
});

test('malformed formatting cannot leak into neighbouring UI', () => {
  assert.equal(formatQuestionText('<strong>未关闭'), '<strong>未关闭</strong>');
  assert.equal(formatQuestionText('<strong><em>嵌套</strong>结束</em>'), '<strong><em>嵌套</em></strong>结束');
  assert.equal(formatQuestionText(null), '');
});
