import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function configureTelegramMenu({token,url,fetchImpl=fetch}){
 if(!token||/\s/.test(token))throw Error('Задайте TELEGRAM_BOT_TOKEN через переменную окружения.');
 let parsed;try{parsed=new URL(url);}catch{throw Error('Задайте TELEGRAM_WEBAPP_URL — публичную HTTPS-ссылку сайта.');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Для Mini App нужна HTTPS-ссылка без логина и пароля в URL.');
 let response,data;
 try{response=await fetchImpl(`https://api.telegram.org/bot${token}/setChatMenuButton`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({menu_button:{type:'web_app',text:'Играть',web_app:{url:parsed.href}}}),signal:AbortSignal.timeout(20000)});data=await response.json();}
 catch{throw Error('Не удалось обратиться к Telegram. Проверьте интернет и повторите настройку.');}
 if(!response.ok||!data.ok)throw Error('Telegram отклонил настройку кнопки. Проверьте токен бота и HTTPS-адрес.');
 return {ok:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))configureTelegramMenu({token:process.env.TELEGRAM_BOT_TOKEN,url:process.env.TELEGRAM_WEBAPP_URL}).then(()=>console.log('Кнопка «Играть» настроена. Откройте @Shishulia_bot в личном чате.')).catch(error=>{console.error(error.message);process.exitCode=1;});
