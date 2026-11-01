/* =====================================================================
   NovaDent AI Chat v2 — виджет ИИ-ассистента (n8n → Gemini)
   ---------------------------------------------------------------------
   • Адрес вебхука НЕ задаётся здесь. Виджет использует вашу уже
     существующую строку в странице:
         const CHAT_WEBHOOK_URL = "https://…/webhook/…";
     (она должна стоять в <script> ДО подключения этого файла).
   • Формат запроса не изменён: POST, JSON { "message": "…" },
     ответ { "reply": "…" } (также поддерживается [{ "reply": "…" }]).
   • Ключей Gemini и учётных данных n8n здесь нет и быть не должно.
   • Сообщения рендерятся только через textContent / createElement.
   • История живёт в памяти страницы: ничего не пишется в localStorage.
   ===================================================================== */
(function novadentChatV2(){
  'use strict';
  if(window.__novadentChatV2)return;           // защита от двойного подключения
  window.__novadentChatV2=true;

  /* ---------- Настройки ---------- */
  const WEBHOOK_URL=(typeof CHAT_WEBHOOK_URL!=='undefined'?CHAT_WEBHOOK_URL:window.NOVADENT_CHAT_WEBHOOK_URL)||'';
  const CONFIG={
    title:'NovaDent AI Assistant',
    timeoutMs:30000,
    maxLength:1000,
    bookingSection:'#booking',                       // существующий блок записи
    bookingFirstField:'#bookingForm input, #bookingForm select, #bookingForm textarea'
  };
  const SUGGESTIONS=[
    'Какие услуги вы предлагаете?',
    'Сколько стоит профессиональная чистка?',
    'Как записаться на приём?',
    'Какие врачи работают в клинике?'
  ];
  const WELCOME='Здравствуйте! 👋 Я ИИ-ассистент стоматологии **НоваДент**.\nПодскажу по услугам, ценам, врачам и записи на приём. Чем могу помочь?';
  // Когда показывать кнопку «Записаться на приём» под ответом ассистента
  const BOOKING_RE=/(запис|услуг|при[её]м|консультац|осмотр|диагностик|стоимост|цен[аыуе]|прайс|сколько\s+стоит|₸|тенге|лечени|кариес|пломб|чистк|гигиен|отбел|имплант|брекет|элайнер|ортодонт|протез|коронк|винир|удален|хирург|врач|доктор|стоматолог)/i;
  // Тревожные симптомы — сразу советуем связаться с клиникой
  const URGENT_RE=/(сильн\w*\s+бол|невыносим|остр\w*\s+бол|оп[уё]х|от[её]к|флюс|кровотеч|кровит|температур|гно[йи]|не\s+могу\s+(открыть\s+рот|глотать)|травм|выбил|сломал)/i;

  // Телефон берём с самой страницы (из раздела контактов), а не выдумываем
  const telLink=document.querySelector('a[href^="tel:"]');
  const CLINIC_PHONE=telLink?{href:telLink.getAttribute('href'),text:telLink.textContent.trim()}:null;

  /* ---------- Мини-хелпер для создания DOM ---------- */
  function h(tag,props,...children){
    const el=document.createElement(tag);
    if(props)for(const k in props){
      const v=props[k];
      if(v==null||v===false)continue;
      if(k==='class')el.className=v;
      else if(k==='text')el.textContent=v;
      else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);
      else el.setAttribute(k,v===true?'':v);
    }
    for(const c of children.flat()){if(c==null)continue;el.appendChild(typeof c==='string'?document.createTextNode(c):c)}
    return el;
  }
  const svg=(markup)=>{const t=document.createElement('template');t.innerHTML=markup.trim();return t.content.firstChild}; // только статичные иконки
  const ICON={
    tooth:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3c-2.5 0-4 2-4 4.5 0 3 1.2 4.5 1.8 7.5.5 2.6 1 6 2.7 6 1.6 0 1.7-3.5 2.6-5.5.4-.8 1.4-.8 1.8 0 .9 2 1 5.5 2.6 5.5 1.7 0 2.2-3.4 2.7-6 .6-3 1.8-4.5 1.8-7.5C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z"/></svg>',
    toothSm:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3c-2.5 0-4 2-4 4.5 0 3 1.2 4.5 1.8 7.5.5 2.6 1 6 2.7 6 1.6 0 1.7-3.5 2.6-5.5.4-.8 1.4-.8 1.8 0 .9 2 1 5.5 2.6 5.5 1.7 0 2.2-3.4 2.7-6 .6-3 1.8-4.5 1.8-7.5C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z"/></svg>',
    chat:'<svg class="novadent-chat-ic-open" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1121 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="3"/></svg>',
    down:'<svg class="novadent-chat-ic-close" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    close:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
    cal:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    reset:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    retry:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    shield:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;margin-top:1px" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
  };

  /* ---------- Разметка виджета ---------- */
  const badge=h('span',{class:'novadent-chat-badge','aria-hidden':'true'});
  const launcher=h('button',{class:'novadent-chat-launcher',type:'button','aria-label':'Открыть чат с ассистентом NovaDent','aria-expanded':'false','aria-controls':'novadent-chat-window'},
    svg(ICON.chat),svg(ICON.down),badge);
  const tooltip=h('div',{class:'novadent-chat-tooltip','aria-hidden':'true',text:'Есть вопрос? Спросите ассистента 👋'});

  const statusDot=h('span',{class:'novadent-chat-dot'});
  const statusText=h('span',{class:'novadent-chat-hd-status',text:'Онлайн'});
  const closeBtn=h('button',{class:'novadent-chat-icon-btn',type:'button','aria-label':'Закрыть чат (переписка сохранится)',title:'Закрыть'},svg(ICON.close));
  const list=h('div',{class:'novadent-chat-messages',role:'log','aria-live':'polite','aria-label':'Переписка с ассистентом',tabindex:'0'});
  const input=h('textarea',{class:'novadent-chat-input',id:'novadent-chat-input',rows:'1',maxlength:String(CONFIG.maxLength),placeholder:'Напишите вопрос…',autocomplete:'off','aria-label':'Ваш вопрос ассистенту'});
  const sendBtn=h('button',{class:'novadent-chat-send',type:'submit','aria-label':'Отправить сообщение',disabled:true},svg(ICON.send));
  const form=h('form',{class:'novadent-chat-form',novalidate:true},input,sendBtn);
  const newBtn=h('button',{class:'novadent-chat-new',type:'button','aria-label':'Начать новый диалог: текущая переписка будет удалена'},svg(ICON.reset),'Начать новый диалог');

  const win=h('div',{class:'novadent-chat-window',id:'novadent-chat-window',role:'dialog','aria-label':CONFIG.title,'aria-hidden':'true'},
    h('div',{class:'novadent-chat-header'},
      h('div',{class:'novadent-chat-hd-avatar','aria-hidden':'true'},svg(ICON.tooth),statusDot),
      h('div',{class:'novadent-chat-hd-text'},h('span',{class:'novadent-chat-hd-title',text:CONFIG.title}),statusText),
      closeBtn),
    h('div',{class:'novadent-chat-notice'},svg(ICON.shield),'ИИ-ассистент даёт справочную информацию и не заменяет консультацию врача.'),
    list,form,
    h('div',{class:'novadent-chat-foot'},h('span',{text:'Не отправляйте паспортные данные и данные карт.'}),newBtn)
  );
  const root=h('div',{class:'novadent-chat-root'},tooltip,launcher,win);
  inert(win,true);
  document.body.appendChild(root);

  /* ---------- Состояние (только в памяти страницы) ---------- */
  let isOpen=false,isWaiting=false,started=false,unread=0,lastFocus=null;
  let suggestEl=null,typingEl=null,controller=null,requestId=0;
  const mobileMQ=window.matchMedia('(max-width:600px)');

  function inert(el,on){if('inert' in el)el.inert=on}

  /* ---------- Безопасный рендер ответа ---------- */
  // Абзацы, переносы строк, списки (- * • 1.) и **жирный** — без innerHTML.
  function appendInline(parent,text){
    for(const part of text.split(/(\*\*[^*\n]+\*\*)/g)){
      if(!part)continue;
      if(/^\*\*[^*\n]+\*\*$/.test(part))parent.appendChild(h('strong',{text:part.slice(2,-2)}));
      else parent.appendChild(document.createTextNode(part));
    }
  }
  function renderRich(container,text){
    let ul=null,p=null;
    for(const raw of String(text).replace(/\r\n?/g,'\n').split('\n')){
      const line=raw.replace(/\s+$/,'');
      const item=line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if(item){p=null;if(!ul){ul=h('ul');container.appendChild(ul)}const li=h('li');appendInline(li,item[1]);ul.appendChild(li)}
      else if(!line.trim()){ul=null;p=null}
      else{
        ul=null;
        if(p)p.appendChild(h('br'));else{p=h('p');container.appendChild(p)}
        appendInline(p,line.replace(/^#{1,6}\s+/,''));
      }
    }
  }

  const timeNow=()=>new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  function scrollToBottom(){requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight})}
  const avatar=()=>h('div',{class:'novadent-chat-avatar','aria-hidden':'true'},svg(ICON.toothSm));

  function addMessage(role,text,opts={}){
    const bubble=h('div',{class:'novadent-chat-bubble'});
    if(role==='bot')renderRich(bubble,text);else bubble.textContent=text;
    const col=h('div',{class:'novadent-chat-col'},
      h('span',{class:'novadent-chat-sr',text:role==='bot'?'Ассистент:':'Вы:'}),
      bubble);
    if(opts.booking)col.appendChild(h('button',{class:'novadent-chat-cta',type:'button',onclick:goToBooking},svg(ICON.cal),'Записаться на приём'));
    col.appendChild(h('span',{class:'novadent-chat-time',text:timeNow()}));
    const row=h('div',{class:'novadent-chat-row novadent-chat-row-'+role},role==='bot'?avatar():null,col);
    list.appendChild(row);scrollToBottom();
    if(role==='bot'&&!isOpen&&started){unread++;badge.textContent=String(unread);badge.classList.add('novadent-chat-show')}
    return row;
  }

  function addUrgentNotice(){
    const el=h('div',{class:'novadent-chat-alert novadent-chat-alert-warn',role:'note'},
      '⚠️ При сильной боли, отёке, кровотечении или температуре не откладывайте визит — ');
    if(CLINIC_PHONE)el.append('позвоните в клинику: ',h('a',{href:CLINIC_PHONE.href,text:CLINIC_PHONE.text}),'. ');
    else el.append('свяжитесь с клиникой. ');
    el.append('Оценить состояние может только врач на осмотре.');
    list.appendChild(el);scrollToBottom();
  }

  function addError(text,retryMessage){
    const el=h('div',{class:'novadent-chat-alert novadent-chat-alert-error',role:'alert'},h('span',{text:text}));
    if(retryMessage!=null){
      el.appendChild(h('button',{class:'novadent-chat-retry',type:'button',onclick:()=>{if(isWaiting)return;el.remove();sendMessage(retryMessage,{retry:true})}},svg(ICON.retry),'Повторить'));
    }
    list.appendChild(el);scrollToBottom();
  }

  function showTyping(on){
    if(on&&!typingEl){
      typingEl=h('div',{class:'novadent-chat-row novadent-chat-row-bot',role:'status'},
        avatar(),
        h('div',{class:'novadent-chat-col'},
          h('div',{class:'novadent-chat-bubble'},
            h('span',{class:'novadent-chat-typing'},h('span',{class:'novadent-chat-dots','aria-hidden':'true'},h('i'),h('i'),h('i')),'Ассистент печатает...'))));
      list.appendChild(typingEl);scrollToBottom();
    }else if(!on&&typingEl){typingEl.remove();typingEl=null}
  }

  function setOnline(ok){
    statusDot.classList.toggle('novadent-chat-off',!ok);statusText.classList.toggle('novadent-chat-off',!ok);
    statusText.textContent=ok?'Онлайн':'Связь нестабильна';
  }
  function setWaiting(on){
    isWaiting=on;
    list.setAttribute('aria-busy',on?'true':'false');
    updateSend();
    if(suggestEl)suggestEl.querySelectorAll('button').forEach(b=>b.disabled=on);
  }
  function updateSend(){sendBtn.disabled=isWaiting||!input.value.trim()}

  /* ---------- Запрос к n8n (формат не изменён) ---------- */
  async function askN8n(message,signal){
    if(!WEBHOOK_URL||/PASTE_N8N/.test(WEBHOOK_URL))throw new Error('not_configured');
    if(/\/webhook-test\//.test(WEBHOOK_URL))console.warn('[NovaDent Chat] Указан Test URL n8n — используйте Production URL (/webhook/…).');
    let res;
    try{
      res=await fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message}),signal});
    }catch(err){throw new Error(err.name==='AbortError'?'aborted':'network')}
    if(!res.ok){const e=new Error('http');e.status=res.status;throw e}
    const raw=await res.text();
    if(!raw.trim())throw new Error('empty');
    let data;try{data=JSON.parse(raw)}catch(e){throw new Error('invalid_json')}
    if(Array.isArray(data))data=data[0];
    const reply=data&&typeof data.reply==='string'?data.reply.trim():'';
    if(!reply)throw new Error('empty');
    return reply;
  }

  // Посетителю — только дружелюбный текст, без кодов и технических деталей
  function friendlyError(code){
    const call=CLINIC_PHONE?' Или позвоните нам: '+CLINIC_PHONE.text+'.':'';
    switch(code){
      case 'not_configured':return 'Ассистент сейчас недоступен.'+(call||' Пожалуйста, свяжитесь с клиникой по телефону.');
      case 'timeout':return 'Ассистент отвечает дольше обычного. Попробуйте отправить вопрос ещё раз.'+call;
      case 'network':return 'Не получилось связаться с ассистентом. Проверьте интернет и попробуйте ещё раз.'+call;
      default:return 'Извините, сейчас не получилось получить ответ. Попробуйте ещё раз через минуту.'+call;
    }
  }

  async function sendMessage(text,opts={}){
    const message=String(text||'').trim().slice(0,CONFIG.maxLength);
    if(!message||isWaiting)return;                      // пустые и повторные отправки блокируем
    if(suggestEl){suggestEl.remove();suggestEl=null}
    if(!opts.retry){
      addMessage('user',message);
      if(URGENT_RE.test(message))addUrgentNotice();
      input.value='';autoGrow();
    }
    const myId=++requestId;
    controller=new AbortController();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort()},CONFIG.timeoutMs);
    setWaiting(true);showTyping(true);
    try{
      const reply=await askN8n(message,controller.signal);
      if(myId!==requestId)return;                        // диалог сброшен — ответ больше не нужен
      showTyping(false);setOnline(true);
      addMessage('bot',reply,{booking:BOOKING_RE.test(message)||BOOKING_RE.test(reply)});
    }catch(err){
      if(myId!==requestId)return;
      showTyping(false);
      const code=err.message==='aborted'&&timedOut?'timeout':err.message;
      console.warn('[NovaDent Chat] Ошибка запроса:',code,err.status||'');
      if(code==='network')console.warn('[NovaDent Chat] Если интернет работает — проверьте CORS (Webhook → Options → Allowed Origins) и что workflow активирован.');
      if(code!=='not_configured')setOnline(false);
      addError(friendlyError(code),code==='not_configured'?null:message);
    }finally{
      clearTimeout(timer);
      if(myId===requestId){controller=null;setWaiting(false);if(isOpen&&!mobileMQ.matches)input.focus({preventScroll:true})}
    }
  }

  /* ---------- Приветствие и быстрые вопросы ---------- */
  function startConversation(){
    started=true;
    addMessage('bot',WELCOME);
    suggestEl=h('div',{class:'novadent-chat-suggest',role:'group','aria-label':'Популярные вопросы'},
      h('span',{class:'novadent-chat-suggest-title',text:'Популярные вопросы'}),
      SUGGESTIONS.map(q=>h('button',{class:'novadent-chat-chip',type:'button',onclick:()=>sendMessage(q)},q)));
    list.appendChild(suggestEl);scrollToBottom();
  }
  function newConversation(){
    requestId++;                                          // игнорируем ответ на прерванный запрос
    if(controller){controller.abort();controller=null}
    showTyping(false);setWaiting(false);setOnline(true);
    list.replaceChildren();suggestEl=null;typingEl=null;
    input.value='';autoGrow();updateSend();
    startConversation();
    if(!mobileMQ.matches)input.focus({preventScroll:true});
  }

  /* ---------- Открыть / закрыть ---------- */
  function openChat(){
    if(isOpen)return;
    isOpen=true;lastFocus=document.activeElement;
    inert(win,false);
    win.classList.add('novadent-chat-open');win.setAttribute('aria-hidden','false');
    launcher.setAttribute('aria-expanded','true');launcher.setAttribute('aria-label','Свернуть чат');
    tooltip.classList.remove('novadent-chat-show');
    unread=0;badge.classList.remove('novadent-chat-show');
    if(mobileMQ.matches)document.body.classList.add('novadent-chat-lock');
    if(!started)startConversation();
    scrollToBottom();
    setTimeout(()=>{if(isOpen)input.focus({preventScroll:true})},mobileMQ.matches?350:60);
  }
  function closeChat(opts={}){
    if(!isOpen)return;
    isOpen=false;
    win.classList.remove('novadent-chat-open');win.setAttribute('aria-hidden','true');
    inert(win,true);
    launcher.setAttribute('aria-expanded','false');launcher.setAttribute('aria-label','Открыть чат с ассистентом NovaDent');
    document.body.classList.remove('novadent-chat-lock');
    if(!opts.keepFocus)(lastFocus&&document.contains(lastFocus)&&lastFocus!==document.body?lastFocus:launcher).focus({preventScroll:true});
  }

  /* ---------- Переход к существующей форме записи ---------- */
  function goToBooking(){
    const section=document.querySelector(CONFIG.bookingSection);
    if(!section)return;
    if(mobileMQ.matches)closeChat({keepFocus:true});      // на телефоне чат закрывает экран — сворачиваем
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
    const field=document.querySelector(CONFIG.bookingFirstField);
    if(field)setTimeout(()=>field.focus({preventScroll:true}),reduce?0:600);
  }

  /* ---------- События ---------- */
  launcher.addEventListener('click',()=>isOpen?closeChat():openChat());
  closeBtn.addEventListener('click',()=>closeChat());
  newBtn.addEventListener('click',newConversation);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen)closeChat()});
  mobileMQ.addEventListener('change',()=>document.body.classList.toggle('novadent-chat-lock',isOpen&&mobileMQ.matches));

  function autoGrow(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,128)+'px'}
  input.addEventListener('input',()=>{autoGrow();updateSend()});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage(input.value)}}); // Shift+Enter — новая строка
  form.addEventListener('submit',e=>{e.preventDefault();sendMessage(input.value)});

  // Ненавязчивая подсказка через 6 секунд (один раз за вкладку)
  let tipShown=false;try{tipShown=sessionStorage.getItem('novadent_chat_tip')==='1'}catch(e){}
  if(!tipShown)setTimeout(()=>{
    if(isOpen||started)return;
    tooltip.classList.add('novadent-chat-show');
    try{sessionStorage.setItem('novadent_chat_tip','1')}catch(e){}
    setTimeout(()=>tooltip.classList.remove('novadent-chat-show'),5000);
  },6000);
})();
