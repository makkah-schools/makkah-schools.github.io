/* Adapted from the user's school-search/ssearch.js: Arabic normalization,
   phonetic variants, affix handling, written numbers and transposition distance.
   Extended for the Makkah schema, identifier search, ranking and broad recall. */
(function(root){
  'use strict';
  const AD='٠١٢٣٤٥٦٧٨٩',PD='۰۱۲۳۴۵۶۷۸۹';
  function norm(value){
    return String(value??'').normalize('NFKC')
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'')
      .replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
      .replace(/ئ/g,'ي').replace(/ؤ/g,'و').replace(/ء/g,'').replace(/ک/g,'ك').replace(/ی/g,'ي')
      .replace(/[٠-٩]/g,d=>AD.indexOf(d)).replace(/[۰-۹]/g,d=>PD.indexOf(d))
      .toLowerCase().replace(/[^a-z0-9\u0621-\u064a\s]/g,' ')
      .replace(/([a-z\u0621-\u064a])(\d)/g,'$1 $2').replace(/(\d)([a-z\u0621-\u064a])/g,'$1 $2')
      .replace(/(ه|ي|ر|ث)(و(?:ال)?(?:عشر[وي]ن|ثلاث[وي]ن|اربع[وي]ن|خمس[وي]ن|ست[وي]ن|سبع[وي]ن|ثمان[وي]ن|تسع[وي]ن))/g,'$1 $2')
      .replace(/بعد(?=المايه|الميه|المائتين|الميتين)/g,'بعد ')
      .replace(/\s+/g,' ').trim();
  }
  const flat=s=>norm(s).replace(/\s/g,'');
  function loose(s){return s.replace(/ظ/g,'ض').replace(/[ذز]/g,'ز').replace(/[ثص]/g,'س').replace(/ط/g,'ت').replace(/[قك]/g,'ك').replace(/غ/g,'ق').replace(/ين$/,'ون');}
  function stems(s){
    const out=new Set([s]);
    if(s==='ابن'||s==='بن')out.add('بن');
    if(['ابو','ابي','ابا'].includes(s))out.add('ابو');
    let b=s.replace(/^(وال|بال|فال|كال|لل|ال)(?=.{3})/,'');out.add(b);
    if(b.startsWith('و')&&b.length>4)out.add(b.slice(1));
    if(b.startsWith('ب')&&b.length>4)out.add(b.slice(1));
    return [...out];
  }
  const UNITS={اولي:1,اول:1,اولى:1,حاديه:1,حادي:1,واحد:1,واحده:1,ثانيه:2,ثاني:2,اثنين:2,اثنان:2,اثنتين:2,اثنتان:2,ثنتين:2,ثالثه:3,ثالث:3,ثلاثه:3,ثلاث:3,رابعه:4,رابع:4,اربعه:4,اربع:4,خامسه:5,خامس:5,خمسه:5,خمس:5,سادسه:6,سادس:6,سته:6,ست:6,سابعه:7,سابع:7,سبعه:7,سبع:7,ثامنه:8,ثامن:8,ثمانيه:8,ثمان:8,تاسعه:9,تاسع:9,تسعه:9,تسع:9,عاشره:10,عاشر:10,عشره:10,عشر:10};
  const TENS={عشرون:20,عشرين:20,ثلاثون:30,ثلاثين:30,اربعون:40,اربعين:40,خمسون:50,خمسين:50,ستون:60,ستين:60,سبعون:70,سبعين:70,ثمانون:80,ثمانين:80,تسعون:90,تسعين:90};
  const HUNDREDS={مايه:100,ميه:100,مائه:100,مئه:100,مياه:100,ميتين:200,مايتين:200,مائتين:200,مئتين:200,مايتان:200,مئتان:200,مائتان:200,ميتان:200,ثلاثمايه:300,ثلاثميه:300,اربعمائه:400,اربعمايه:400,خمسمايه:500,خمسمائه:500};
  const numberValue=b=>UNITS[b]??TENS[b]??HUNDREDS[b];
  function numberBare(w){
    if(numberValue(w)!==undefined)return w;
    const without=w.replace(/^(وال|بال|ال)/,'');
    if(numberValue(without)!==undefined)return without;
    return without.startsWith('و')&&numberValue(without.slice(1))!==undefined?without.slice(1):without;
  }
  function numbers(text){
    const tokens=norm(text).split(' '),values=[],used=new Set();
    for(let i=0;i<tokens.length;i++){
      let b=numberBare(tokens[i]);if(numberValue(b)===undefined)continue;
      let value=0,lastUnit=0,after=false;
      for(let j=i;j<tokens.length;j++){
        b=numberBare(tokens[j]);const v=numberValue(b);
        if(v!==undefined){
          if(v>=100&&lastUnit>1&&lastUnit<10&&!after){value=value-lastUnit+lastUnit*v;}
          else value+=v;
          lastUnit=v<10?v:0;used.add(j);i=j;
        }else if(tokens[j]==='بعد'||tokens[j]==='و'){used.add(j);after=after||tokens[j]==='بعد';i=j;}
        else break;
      }
      if(value)values.push(value);
    }
    return {values,used,tokens};
  }
  function ordinal(s){return numbers(s).values[0]||0;}
  function distance(a,b,max=2){
    if(a===b)return 0;if(Math.abs(a.length-b.length)>max)return max+1;
    let prev2=null,prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const row=[i];
      for(let j=1;j<=b.length;j++){
        row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
        if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],prev2[j-2]+1);
      }
      prev2=prev;prev=row;
    }
    return prev[b.length];
  }
  const COMMON=new Set(norm('ابتدائية الابتدائية ابتدائي الابتدائي متوسطة المتوسطة متوسط المتوسط ثانوية الثانوية ثانوي الثانوي مدرسة المدرسة مدارس للبنين للبنات بنين بنات طالبات طلاب تحفيظ لتحفيظ القرآن قرآن الكريم الطفولة المبكرة مجمع بن ابن بعد صفوف عليا تعليم التعليم عام الخاصة خاصة تربية التربية برنامج الملحق روضة الروضة بمكة مكة المكرمة مسارات الأهلية').split(' '));
  const LABELS=new Set('اسم مدرسه المدرسه رقم الرقم وزاري الوزاري مدير المدير هويه جوال بريد البريد'.split(' '));
  const KEYS={'q':'ض','w':'ص','e':'ث','r':'ق','t':'ف','y':'غ','u':'ع','i':'ه','o':'خ','p':'ح','[':'ج',']':'د','a':'ش','s':'س','d':'ي','f':'ب','g':'ل','h':'ا','j':'ت','k':'ن','l':'م',';':'ك',"'":'ط','z':'ئ','x':'ء','c':'ؤ','v':'ر','b':'لا','n':'ى','m':'ة',',':'و','.':'ز','/':'ظ'};
  function keyboard(s){return String(s).toLowerCase().split('').map(c=>KEYS[c]??c).join('');}
  function index(list){
    const vocab=new Map(),docs=[];
    function token(t,minJoinLength=0){
      if(!vocab.has(t))vocab.set(t,{t,st:stems(t),lo:stems(t).map(loose),docs:[],nameDocs:[],minJoinLength});
      else vocab.get(t).minJoinLength=Math.min(vocab.get(t).minJoinLength,minJoinLength);
      return vocab.get(t);
    }
    for(const s of list){
      const name=norm(s.name),manager=norm(s.manager),extras=norm([s.stage,s.gender==='f'?'بنات':s.gender==='m'?'بنين':s.gender,s.sector,s.region,s.town,s.type,s.office].join(' '));
      const words=new Map([...name.split(' '),...manager.split(' '),...extras.split(' ')] .filter(Boolean).map(w=>[w,0]));
      // Adjacent joins allow عبد الله/عبدالله, أبو بكر/أبوبكر and omitted spaces.
      for(const text of [name,manager]){const ts=text.split(' ');for(let i=0;i<ts.length-1;i++){
        const joined=ts[i]+ts[i+1],min=Math.max(ts[i].length,ts[i+1].length)+1;
        if(joined.length<=24&&!words.has(joined))words.set(joined,min);
      }}
      const nums=[...new Set([...numbers(name).values,...(name.match(/\d+/g)||[]).map(Number)])];
      const identifiers=[['code',s.code],['identity',s.identity],['phone',s.phone],['email',s.email]].filter(([,v])=>v).map(([field,v])=>({field,key:flat(v)}));
      const altManagers=(s.conflicts||[]).filter(c=>c.field==='manager').map(c=>norm(c.value));
      for(const alt of altManagers)for(const w of alt.split(' '))words.set(w,0);
      const tokens=[...words].map(([w,min])=>token(w,min));for(const t of tokens)t.docs.push(docs.length);
      const nameWords=new Set(name.split(' ').filter(Boolean)),nameParts=name.split(' ');
      for(let i=0;i<nameParts.length-1;i++)if((nameParts[i]+nameParts[i+1]).length<=24)nameWords.add(nameParts[i]+nameParts[i+1]);
      for(const w of nameWords)vocab.get(w).nameDocs.push(docs.length);
      docs.push({s,name,nameFlat:flat(name),managerFlat:flat(manager),altManagers:altManagers.map(flat),words:tokens,nums,identifiers});
    }
    return {docs,vocab:[...vocab.values()],cache:new Map()};
  }
  function tokenScore(q,t,expanded=false){
    let best=0;
    for(const x of stems(q))for(const y of t.st){
      if(x===y)return 1;
      if(x.length>=2&&y.startsWith(x))best=Math.max(best,.93);
      if(x.length>=3&&y.includes(x))best=Math.max(best,.8);
      if(x.length>=3&&loose(x)===loose(y))best=Math.max(best,.89);
      if(x.length>=3){
        const max=expanded&&x.length>=7?3:x.length>=6?2:1,d=distance(x,y,max);
        if(d<=max)best=Math.max(best,d===1?.81:d===2?.66:.51);
        const ld=distance(loose(x),loose(y),max);
        if(ld<=max)best=Math.max(best,ld===1?.74:ld===2?.61:.49);
        if(x.length>=4&&y.length>x.length&&distance(x,y.slice(0,x.length),1)<=1)best=Math.max(best,.64);
      }
    }
    return best;
  }
  function wordMatches(idx,w,expanded,mode){
    const key=mode+':'+(expanded?'b:':'s:')+w;
    if(idx.cache.has(key))return idx.cache.get(key);
    const scores=new Float32Array(idx.docs.length);
    for(const t of idx.vocab){const postings=mode==='name'?t.nameDocs:t.docs;if(!postings.length||w.length<t.minJoinLength)continue;const sc=tokenScore(w,t,expanded);if(sc)for(const id of postings)if(sc>scores[id])scores[id]=sc;}
    if(idx.cache.size>1800)idx.cache.delete(idx.cache.keys().next().value);idx.cache.set(key,scores);return scores;
  }
  function idScore(query,id,expanded){
    let q=query,key=id.key;
    if(q===key)return {score:1,reason:id.field==='code'?'الرقم الوزاري مطابق':'بيانات رقمية مطابقة'};
    if(/^\d+$/.test(q)){
      key=key.replace(/^m/,'');
      if(q.replace(/^0+/,'')===key.replace(/^0+/,''))return {score:.98,reason:'الرقم مطابق بعد توحيد الصيغة'};
      if(id.field==='phone'&&key.replace(/^966/,'0')===q.replace(/^966/,'0'))return {score:.98,reason:'رقم الجوال مطابق'};
    }
    if(q.length>=3&&key.includes(q))return {score:.87,reason:'جزء من '+(id.field==='code'?'الرقم الوزاري':'البيانات الرقمية')};
    if(q.length>=4&&/^[m]?\d+$/.test(q)&&/^[m]?\d+$/.test(key)){
      const max=Math.min(q.length,key.length)>=7?(expanded?3:2):expanded&&Math.min(q.length,key.length)>=5?2:1;
      const d=distance(q,key,max);if(d<=max)return {score:d===1?.76:d===2?.6:.5,reason:'رقم قريب؛ راجع الرقم الوزاري والبيانات'};
    }
    return null;
  }
  function evaluate(idx,raw,expanded,literalNumbers=false,mode='all'){
    const q=norm(raw),qflat=flat(raw);if(!q)return [];
    const parsed=literalNumbers?{tokens:q.split(' '),values:[],used:new Set()}:numbers(q),explicit=(q.match(/\d+/g)||[]),nameNums=[...parsed.values,...explicit.filter(x=>x.length<=3).map(Number)];
    const hasOrdinal=parsed.values.length>0;
    let words=parsed.tokens.filter((w,i)=>!parsed.used.has(i)&&!/^\d+$/.test(w)&&w.length>1);
    if(words.some(w=>!LABELS.has(w)))words=words.filter(w=>!LABELS.has(w));
    if(explicit.length)words=words.filter(w=>!LABELS.has(w)&&w!=='m');
    const weight=w=>COMMON.has(w)?.3:1;
    const wordMaps=words.map(w=>wordMatches(idx,w,expanded,mode));
    const codeQueries=explicit.length?[...explicit,...explicit.map(x=>'m'+x),qflat]:[qflat];
    const hits=[];
    for(let di=0;di<idx.docs.length;di++){
      const d=idx.docs[di];
      let score=0,reason='',category='possible',numericScore=0,numericReason='';
      for(const id of mode==='name'?[]:d.identifiers)for(const codeQuery of codeQueries){
        if(explicit.length&&codeQuery.length<5&&id.field!=='code')continue;
        const m=idScore(codeQuery,id,expanded);if(m&&m.score>numericScore){numericScore=m.score;numericReason=m.reason;}
      }
      if(d.nameFlat===qflat){score=d.s.name===String(raw).trim()?210:200;reason='اسم مطابق';category='exact';}
      else if(mode!=='name'&&(d.managerFlat===qflat||d.altManagers.includes(qflat))){score=193;reason='اسم المدير مطابق';category='exact';}
      else if(numericScore>=.98&&!hasOrdinal){score=199;reason=numericReason;category='exact';}
      else if(qflat.length>=2&&(d.nameFlat.includes(qflat)||mode!=='name'&&d.managerFlat.includes(qflat))){score=180;reason=d.nameFlat.includes(qflat)?'جزء من اسم المدرسة':'جزء من اسم المدير';category='close';}
      let numScore=0;
      if(nameNums.length){
        if(nameNums.some(x=>d.nums.includes(x)))numScore=1;
        else if(nameNums.some(x=>x<100&&d.nums.some(y=>y>100&&y%100===x)))numScore=.72;
        else if(expanded&&nameNums.some(x=>String(x).length>=2&&d.nums.some(y=>distance(String(x),String(y),1)<=1)))numScore=.56;
      }
      const needNumeric=explicit.length||hasOrdinal;
      const validNumeric=Math.max(numScore,numericScore);
      let sum=0,total=0,matched=0,coreMatched=0,coreCount=0;
      for(let i=0;i<words.length;i++){
        const best=wordMaps[i][di];
        const wt=weight(words[i]);sum+=best*wt;total+=wt;
        const threshold=expanded?.48:.6;
        if(best>=threshold)matched++;if(wt===1){coreCount++;if(best>=threshold)coreMatched++;}
      }
      if(needNumeric){sum+=validNumeric*1.8;total+=1.8;}
      const avg=total?sum/total:0;
      const coverage=words.length?matched/words.length:1;
      const coreCoverage=coreCount?coreMatched/coreCount:coverage;
      const accept=(!needNumeric||validNumeric>0)&&(words.length===0||coreMatched>0||!coreCount)&&(avg>=(expanded?.46:.6))&&(coreCoverage>=(expanded?.34:.7));
      if(accept){
        const candidate=100*avg+((coreCoverage===1&&coverage===1)?8:0);
        if(candidate>score){score=candidate;category=avg>=.88&&coreCoverage===1?'close':'possible';reason=needNumeric?(numScore>=numericScore?(numScore===1?'رقم المدرسة في الاسم':'رقم محتمل في اسم المدرسة'):numericReason):(coverage===1?'كلمات قريبة أو بترتيب مختلف':'تطابق جزئي؛ راجع اسم المدرسة');}
      }
      // Handles a dropped/added space or one typo in a short joined query.
      if(qflat.length>=4&&qflat.length<=40&&!needNumeric){
        for(const name of mode==='name'?[d.nameFlat]:[d.nameFlat,d.managerFlat]){
          if(Math.abs(name.length-qflat.length)>2)continue;
          const diff=distance(qflat,name,2);
          if(diff<=2&&score<155-diff*10){score=155-diff*10;category='close';reason='اسم قريب مع خطأ إملائي';}
        }
      }
      if(score)hits.push({s:d.s,score,reason,category});
    }
    return hits;
  }
  function codeSearch(idx,raw,expanded){
    const q=norm(raw),compact=q.split(' ').filter(w=>!LABELS.has(w)).join('');if(!compact)return [];
    const hits=[];
    for(const d of idx.docs){
      const id=d.identifiers.find(id=>id.field==='code');if(!id)continue;
      const match=idScore(compact,id,expanded);if(!match)continue;
      hits.push({s:d.s,score:match.score*199,reason:match.reason,category:match.score>=.98?'exact':match.score>=.85?'close':'possible'});
    }
    return hits;
  }
  function search(idx,query,options={}){
    if(!norm(query))return [];
    const merged=new Map();
    const variants=[{q:query,penalty:0}];
    const identifier=flat(query),looksLikeCode=/^m?[0-9oilsb]+$/.test(identifier)&&(identifier.match(/\d/g)||[]).length>=3;
    if(looksLikeCode&&/[oilsb]/.test(identifier))variants.push({q:identifier.replace(/[oilsb]/g,c=>({o:'0',i:'1',l:'1',s:'5',b:'8'}[c])),penalty:8,reason:'احتمال تشابه الحروف والأرقام'});
    if(/[a-z]/i.test(query)&&!looksLikeCode&&!/@/.test(query))variants.push({q:keyboard(query),penalty:12,reason:'احتمال الكتابة بلوحة مفاتيح إنجليزية'});
    for(const v of [...variants]){
      const nq=norm(v.q),repaired=nq
        .replace(/(^| )((?:[\u0621-\u064a] ){2,}[\u0621-\u064a])(?= |$)/g,(_,lead,letters)=>lead+letters.replace(/ /g,''))
        .replace(/(^| )([\u0621-\u064a]) (?=[\u0621-\u064a]{2})/g,'$1$2');
      if(repaired!==nq)variants.push({q:repaired,penalty:5+v.penalty,reason:'احتمال وجود مسافات زائدة داخل الكلمات'});
    }
    for(const v of variants){
      const interpretations=[{literal:false,penalty:0}];
      if(options.mode!=='code'&&numbers(v.q).values.length)interpretations.push({literal:true,penalty:15});
      for(const interpretation of interpretations)for(const hit of options.mode==='code'?codeSearch(idx,v.q,!!options.expanded):evaluate(idx,v.q,!!options.expanded,interpretation.literal,options.mode||'all')){
        hit.score-=v.penalty+interpretation.penalty;
        if(v.penalty){hit.reason=v.reason;hit.category='possible';}
        else if(interpretation.literal&&hit.category!=='exact'){hit.reason='احتمال نصي للاسم أو خطأ في العدد المكتوب';hit.category='possible';}
        if(!merged.has(hit.s.id)||merged.get(hit.s.id).score<hit.score)merged.set(hit.s.id,hit);
      }
    }
    return [...merged.values()].sort((a,b)=>b.score-a.score||a.s.name.localeCompare(b.s.name,'ar')||a.s.id-b.s.id);
  }
  const api={norm,loose,stems,ordinal,numbers,distance,index,search,keyboard};root.SchoolSearch=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
