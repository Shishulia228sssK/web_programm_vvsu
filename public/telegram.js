// Telegram is a UI host only. Account authentication stays on our server.
(function(){
 let initialized=false;
 function init(app){
  if(initialized||!app)return;initialized=true;document.body.classList.add('telegram-app');
  const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  function layout(){const safe=app.safeAreaInset||{},content=app.contentSafeAreaInset||{};for(const side of ['top','bottom','left','right'])document.documentElement.style.setProperty('--tg-safe-'+side,(number(safe[side])+number(content[side]))+'px');document.documentElement.style.setProperty('--tg-viewport-height',(number(app.viewportStableHeight)||innerHeight)+'px');}
  function navigation(){const modal=document.querySelector('dialog[open]');if(modal||document.body.dataset.view!=='lobby')app.BackButton?.show();else app.BackButton?.hide();}
  function colors(){const light=document.documentElement.dataset.theme==='light';app.setHeaderColor?.(light?'#efeee8':'#101014');app.setBackgroundColor?.(light?'#efeee8':'#101014');}
  function back(){const dialogs=[...document.querySelectorAll('dialog[open]')];if(dialogs.length){dialogs.at(-1).close();return;}(document.querySelector('#backBtn')||document.querySelector('#lobbyNav'))?.click();}
  app.BackButton?.onClick(back);app.onEvent?.('viewportChanged',layout);app.onEvent?.('safeAreaChanged',layout);app.onEvent?.('contentSafeAreaChanged',layout);
  new MutationObserver(()=>{navigation();colors();}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-view','data-theme','open']});
  layout();navigation();colors();app.ready?.();app.expand?.();
 }
 function isLaunch(){return /(?:tgWebAppData|tgWebAppVersion)=/.test(location.hash+' '+location.search);}
 window.LudkaTelegram={init,isLaunch};
 if(window.Telegram?.WebApp&&isLaunch()){init(window.Telegram.WebApp);return;}
 if(!isLaunch())return;
 const script=document.createElement('script');script.src='https://telegram.org/js/telegram-web-app.js';script.onload=()=>init(window.Telegram?.WebApp);script.onerror=()=>{console.info('Telegram SDK недоступен; интерфейс работает в обычном режиме.');};document.head.append(script);
})();
