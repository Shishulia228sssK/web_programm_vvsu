import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTelegramMenu} from '../scripts/telegram-menu.mjs';
test('Telegram menu helper sends only the requested Web App button using injected fetch',async()=>{
 let request;const fake='123456:synthetic_test_token_only';const r=await configureTelegramMenu({token:fake,url:'https://example.test',fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({ok:true,result:true})}}});assert.equal(r.ok,true);assert.match(request.url,/setChatMenuButton$/);assert.equal(request.options.method,'POST');assert.deepEqual(JSON.parse(request.options.body),{menu_button:{type:'web_app',text:'Играть',web_app:{url:'https://example.test/'}}});
});
test('Telegram menu helper rejects unsafe URLs and never exposes a token in errors',async()=>{
 const token='synthetic_secret_not_real';await assert.rejects(configureTelegramMenu({token,url:'http://example.test'}),/HTTPS/);await assert.rejects(configureTelegramMenu({token,url:'https://user:password@example.test'}),/HTTPS/);
 try{await configureTelegramMenu({token,url:'https://example.test',fetchImpl:async()=>{throw Error('https://api.telegram.org/bot'+token);}});assert.fail('Expected failure');}catch(e){assert.ok(!e.message.includes(token));assert.match(e.message,/Не удалось/);}
});
