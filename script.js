const CLASSIC = {
  allocation: [[0,1,0],[2,0,0],[3,0,2],[2,1,1],[0,0,2]],
  maximum: [[7,5,3],[3,2,2],[9,0,2],[2,2,2],[4,3,3]],
  available: [3,3,2], resources: ["A","B","C"]
};
const COMPACT = {
  allocation: [[1,0,1],[1,1,0],[1,0,1],[0,1,1],[0,0,1]],
  maximum: [[2,1,1],[1,2,1],[3,1,1],[1,1,2],[1,1,2]],
  available: [2,1,1], resources: ["A","B","C"]
};
let state, activity = [], lastTestRows = [];

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const clone = x => JSON.parse(JSON.stringify(x));
const pLabel = i => `P${i}`;
const vec = a => `(${a.join(", ")})`;

function reset(name="classic", logIt=true) {
  state = clone(name==="compact" ? COMPACT : CLASSIC);
  activity = [];
  state.profile = name;
  if (logIt) addActivity("Scenario reset", name==="classic" ? "Classic Banker example loaded." : "Compact demo loaded.", "↻");
  renderAll();
}
function addActivity(title, detail, icon="•") {
  activity.unshift({title,detail,icon,time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})});
  activity = activity.slice(0,5);
  const el=$("#activityList");
  if(el) renderActivity();
}
function validateState(s=state) {
  if(!s.allocation.length || !s.available.length) return "At least one process and resource type are required.";
  if(s.maximum.length!==s.allocation.length) return "Allocation and Maximum must have equal process counts.";
  const m=s.available.length;
  if([...s.allocation,...s.maximum].some(r=>r.length!==m)) return "Matrix dimensions do not match the Available vector.";
  const vals=[...s.allocation.flat(),...s.maximum.flat(),...s.available];
  if(vals.some(v=>!Number.isInteger(v)||v<0)) return "Resource counts must be non-negative integers.";
  for(let i=0;i<s.allocation.length;i++) for(let j=0;j<m;j++) if(s.allocation[i][j]>s.maximum[i][j]) return `${pLabel(i)} Allocation exceeds Maximum for resource ${s.resources[j]}.`;
  return null;
}
function needMatrix(s=state) {
  return s.allocation.map((row,i)=>row.map((v,j)=>s.maximum[i][j]-v));
}
function safetyCheck(allocation=state.allocation, maximum=state.maximum, available=state.available) {
  const s={allocation,maximum,available,resources:state.resources};
  const error=validateState(s);
  if(error) return {valid:false,error,safe:false,sequence:[],steps:[],unfinished:[]};
  const need=needMatrix(s), work=available.slice(), finish=allocation.map(()=>false), sequence=[], steps=[];
  while(true) {
    let chosen=-1;
    for(let i=0;i<allocation.length;i++) {
      if(finish[i]) continue;
      if(need[i].every((n,j)=>n<=work[j])) { chosen=i; break; }
    }
    if(chosen<0) break;
    const i=chosen, before=work.slice(), released=allocation[i].slice();
    for(let j=0;j<work.length;j++) work[j]+=allocation[i][j];
    finish[i]=true; sequence.push(pLabel(i));
    steps.push({process:pLabel(i),need:need[i],before,released,after:work.slice(),canFinish:true});
  }
  const unfinished=finish.map((done,i)=>done?null:pLabel(i)).filter(Boolean);
  unfinished.forEach(label=>{
    const i=Number(label.slice(1));
    steps.push({process:label,need:need[i],before:work.slice(),released:work.map(()=>0),after:work.slice(),canFinish:false});
  });
  return {valid:true,safe:finish.every(Boolean),sequence,steps,unfinished,need,finalWork:work};
}
function requestResources(pid, request) {
  const error=validateState();
  if(error) return {status:"Invalid state",message:error,granted:false};
  if(!Number.isInteger(pid)||pid<0||pid>=state.allocation.length) return {status:"Invalid request",message:"Select a valid process.",granted:false};
  if(request.length!==state.resources.length||request.some(v=>!Number.isInteger(v)||v<0)) return {status:"Invalid request",message:"Request must contain non-negative integers.",granted:false};
  const need=needMatrix();
  if(request.some((v,j)=>v>need[pid][j])) return {status:"Invalid request",message:`Request ${vec(request)} exceeds P${pid}'s remaining Need ${vec(need[pid])}.`,granted:false};
  if(request.some((v,j)=>v>state.available[j])) return {status:"Waiting",message:`Request ${vec(request)} exceeds current Available ${vec(state.available)}. It cannot be granted now; state unchanged.`,granted:false};
  const a=clone(state.allocation), av=state.available.slice();
  request.forEach((v,j)=>{a[pid][j]+=v;av[j]-=v;});
  const check=safetyCheck(a,state.maximum,av);
  if(!check.safe) return {status:"Denied — unsafe",message:"The request is within Need and Available, but the resulting state is unsafe. Original state preserved.",granted:false,safety:check};
  state.allocation=a;state.available=av;
  return {status:"Granted",message:"Request granted: the resulting state is safe.",granted:true,safety:check};
}
function detectDeadlock(allocation, request, total) {
  const n=allocation.length,m=total.length;
  if(!n||request.length!==n||[...allocation,...request].some(r=>r.length!==m)) return {valid:false,error:"Allocation and Request dimensions must match Total."};
  if([...allocation.flat(),...request.flat(),...total].some(v=>!Number.isInteger(v)||v<0)) return {valid:false,error:"All values must be non-negative integers."};
  const allocated=total.map((_,j)=>allocation.reduce((sum,row)=>sum+row[j],0));
  if(allocated.some((v,j)=>v>total[j])) return {valid:false,error:"Total resources cannot be less than allocated resources."};
  const available=total.map((v,j)=>v-allocated[j]), work=available.slice();
  const finish=allocation.map(row=>row.every(v=>v===0)),steps=[];
  while(true){
    let chosen=-1;
    for(let i=0;i<n;i++) if(!finish[i]&&request[i].every((v,j)=>v<=work[j])){chosen=i;break;}
    if(chosen<0)break;
    const i=chosen,before=work.slice();
    work.forEach((_,j)=>work[j]+=allocation[i][j]);finish[i]=true;
    steps.push({process:pLabel(i),request:request[i],before,released:allocation[i],after:work.slice()});
  }
  const deadlocked=finish.map((v,i)=>v?null:pLabel(i)).filter(Boolean);
  return {valid:true,available,steps,deadlocked,isDeadlocked:deadlocked.length>0};
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function tableHTML(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function matrixHTML(matrix, resources=state.resources, labels=matrix.map((_,i)=>pLabel(i))) {
  return tableHTML(["Process",...resources],matrix.map((row,i)=>[`<span class="process-pill">${esc(labels[i])}</span>`,...row.map(v=>`<span class="mono">${v}</span>`)]));
}
function vectorHTML(values,resources=state.resources) {
  return `<div class="vector-row">${values.map((v,j)=>`<div class="vector-chip"><span>${esc(resources[j])}</span><b>${v}</b></div>`).join("")}</div>`;
}
function renderActivity(){
  const el=$("#activityList");if(!el)return;
  const items=activity.length?activity:[{title:"Simulation ready",detail:"No operations recorded yet.",icon:"◈",time:"NOW"}];
  el.innerHTML=items.map(x=>`<div class="activity-item"><div class="activity-icon">${esc(x.icon)}</div><div class="activity-copy"><b>${esc(x.title)}</b><small>${esc(x.detail)}</small></div><span class="activity-time">${esc(x.time)}</span></div>`).join("");
}
function renderOverview(){
  const check=safetyCheck(),need=needMatrix(),total=state.available.reduce((a,b)=>a+b,0);
  const metrics=[
    ["Active processes",state.allocation.length,"PROCESS POOL","▦","5 configured"],
    ["Resource types",state.resources.length,"RESOURCE CLASSES","◈",state.resources.join(" · ")],
    ["Available instances",total,"READY TO ALLOCATE","▤",vec(state.available)],
    ["Safety status",check.safe?"SAFE":"UNSAFE","BANKER'S ANALYSIS",check.safe?"✓":"!",check.safe?"Safe sequence found":"No complete safe sequence"]
  ];
  $("#overviewMetrics").innerHTML=metrics.map((m,i)=>`<div class="metric"><div class="metric-top"><span>${m[0]}</span><span class="metric-symbol">${m[3]}</span></div><div class="metric-value" style="${i===3?`color:${check.safe?'var(--teal)':'var(--red)'}`:''}">${m[1]}</div><div class="metric-note">${m[4]}</div></div>`).join("");
  const max=Math.max(1,...state.available);
  $("#resourceBars").innerHTML=state.resources.map((r,j)=>`<div class="resource-bar-row"><span class="resource-letter">${r}</span><div class="bar-track"><div class="bar-fill" style="width:${state.available[j]/max*100}%"></div></div><span class="bar-number">${state.available[j]} units</span></div>`).join("");
  $("#totalResourceCount").textContent=`${total} TOTAL AVAILABLE`;
  $("#safetyGauge").innerHTML=`<div class="gauge-ring" style="background:conic-gradient(${check.safe?'var(--teal)':'var(--red)'} ${check.safe?'300deg':'100deg'},#243149 0)"><div class="gauge-value">${check.safe?'OK':'!'}</div></div><div class="gauge-caption" style="color:${check.safe?'var(--teal)':'var(--red)'}">${check.safe?'SAFE STATE':'UNSAFE STATE'}</div><div class="gauge-note">${check.safe?`${check.sequence.length} processes can finish`:`${check.unfinished.length} process(es) blocked`}</div>`;
  $("#miniAllocation").innerHTML=tableHTML(["Process",...state.resources],state.allocation.map((r,i)=>[`<span class="process-pill">${pLabel(i)}</span>`,...r]));
  renderActivity();
}
function renderBanker(){
  $("#allocationMatrix").innerHTML=matrixHTML(state.allocation);
  $("#maximumMatrix").innerHTML=matrixHTML(state.maximum);
  $("#needMatrix").innerHTML=matrixHTML(needMatrix());
  $("#availableVector").innerHTML=vectorHTML(state.available);
  $("#runSafety").onclick=()=>{const r=safetyCheck();$("#safetyResult").innerHTML=resultHTML(r,"Safety analysis");addActivity("Safety analysis",r.safe?"System is safe.":"System is unsafe.","✓");renderOverview();};
  $("#editMatrices").onclick=()=>{const el=$("#matrixEditor");el.classList.toggle("hidden");renderMatrixEditor();};
  $("#safetyResult").innerHTML=resultHTML(safetyCheck(),"Current safety result");
}
function renderMatrixEditor(){
  const el=$("#matrixEditor");if(el.classList.contains("hidden"))return;
  const n=state.allocation.length,m=state.resources.length;
  const editor=(name,mat)=>`<div><label class="field-label">${name}</label>${mat.map((row,i)=>`<div class="editor-row"><span>${pLabel(i)}</span>${row.map((v,j)=>`<input class="field-control mono" type="number" min="0" step="1" data-matrix="${name}" data-i="${i}" data-j="${j}" value="${v}" aria-label="${name} ${pLabel(i)} ${state.resources[j]}">`).join("")}</div>`).join("")}</div>`;
  el.innerHTML=`<div class="panel-heading"><div><div class="panel-eyebrow">MANUAL OVERRIDE</div><h3>Edit system matrices</h3></div><button class="btn btn-ghost btn-small" id="cancelEdit">Cancel</button></div><p class="panel-description">All values must be non-negative integers and Allocation cannot exceed Maximum.</p><div class="editor-grid">${editor("Allocation",state.allocation)}${editor("Maximum",state.maximum)}<div><label class="field-label">Available vector</label><div class="editor-row">${state.available.map((v,j)=>`<input class="field-control mono" type="number" min="0" step="1" data-matrix="Available" data-i="0" data-j="${j}" value="${v}" aria-label="Available ${state.resources[j]}">`).join("")}</div></div></div><div class="action-row"><button class="btn btn-primary" id="saveMatrices">Save & validate</button><button class="btn btn-secondary" id="restoreMatrices">Restore current values</button></div><div id="editorError"></div>`;
  $("#cancelEdit").onclick=()=>el.classList.add("hidden");
  $("#restoreMatrices").onclick=()=>renderMatrixEditor();
  $("#saveMatrices").onclick=()=>{
    const a=clone(state.allocation),mx=clone(state.maximum),av=state.available.slice();
    let bad=false;
    $$("[data-matrix]",el).forEach(inp=>{
      const val=Number(inp.value),i=Number(inp.dataset.i),j=Number(inp.dataset.j);
      if(!Number.isInteger(val)||val<0){bad=true;return;}
      if(inp.dataset.matrix==="Allocation")a[i][j]=val;
      else if(inp.dataset.matrix==="Maximum")mx[i][j]=val;
      else av[j]=val;
    });
    const err=bad?"Use non-negative whole numbers only.":validateState({allocation:a,maximum:mx,available:av,resources:state.resources});
    if(err){$("#editorError").innerHTML=`<div class="result-card danger"><b>Cannot save matrices</b><p>${esc(err)}</p></div>`;return;}
    state.allocation=a;state.maximum=mx;state.available=av;el.classList.add("hidden");addActivity("Matrices updated","Manual resource state saved.","✎");renderAll();toast("Matrices saved and validated.","success");
  };
}
function resultHTML(r,title="Algorithm result"){
  if(!r||!r.valid)return `<div class="result-card danger"><div class="result-title"><span class="result-mark">!</span>Invalid input</div><p>${esc(r?.error||"An error occurred.")}</p></div>`;
  const safe=r.safe,kind=safe?"success":"danger";
  let html=`<div class="result-card ${kind}"><div class="result-title"><span class="result-mark">${safe?"✓":"!"}</span>${safe?"SAFE STATE":"UNSAFE STATE"} <span class="matrix-tag">${esc(title.toUpperCase())}</span></div><p>${safe?"All processes can finish in the displayed order.":"A complete safe sequence could not be found with the current Work vector."}</p>`;
  if(safe)html+=`<div class="sequence-line">SAFE SEQUENCE &nbsp; ${r.sequence.join(" &nbsp; → &nbsp; ")}</div>`;
  else html+=`<p>Unfinished processes: <b>${r.unfinished.join(", ")||"None"}</b></p>`;
  html+=`</div>`;
  if(r.steps?.length){
    html+=`<div class="panel steps-table"><h4>STEP-BY-STEP SAFETY CHECK</h4>${tableHTML(["Process","Need","Work before","Can finish?","Allocation released","Work after"],r.steps.map(s=>[s.process,vec(s.need),vec(s.before),`<span class="${s.canFinish?'pass-pill':'fail-pill'}">${s.canFinish?"YES":"NO"}</span>`,vec(s.released),vec(s.after)]))}</div>`;
  }
  return html;
}
function renderRequest(){
  const select=$("#requestProcess"),old=select.value;
  select.innerHTML=state.allocation.map((_,i)=>`<option value="${i}">${pLabel(i)}</option>`).join("");
  if(old&&Number(old)<state.allocation.length)select.value=old;
  $("#requestInputs").innerHTML=state.resources.map((r,j)=>`<div class="request-input"><label><span>${r}</span>REQUEST</label><input type="number" min="0" step="1" value="0" data-request="${j}" aria-label="Request ${r}"></div>`).join("");
  const needs=needMatrix()[Number(select.value)||0];
  $("#requestLimits").innerHTML=state.resources.map((r,j)=>`<div class="request-limit-row"><span class="res-tag">${r}</span><span>Remaining need</span><b>${needs[j]}</b><span>Available</span><b>${state.available[j]}</b></div>`).join("");
  select.onchange=()=>renderRequestLimits();
  $("#processRequest").onclick=()=>{
    const pid=Number(select.value),inputs=$$("[data-request]"),request=inputs.map(i=>Number(i.value));
    if(request.some(v=>!Number.isInteger(v)||v<0)){toast("Enter non-negative whole numbers.","error");return;}
    const r=requestResources(pid,request);
    let cls=r.granted?"success":r.status==="Waiting"?"warning":"danger";
    $("#requestResult").innerHTML=`<div class="result-card ${cls}"><div class="result-title"><span class="result-mark">${r.granted?"✓":r.status==="Waiting"?"⌛":"!"}</span>${esc(r.status)}</div><p>${esc(r.message)}</p>${r.granted?`<div class="sequence-line">UPDATED AVAILABLE &nbsp; ${vec(state.available)}</div><div class="sequence-line">UPDATED ALLOCATION · ${pLabel(pid)} &nbsp; ${vec(state.allocation[pid])}</div>`:""}</div>${r.safety?resultHTML(r.safety,"Trial state"):""}`;
    addActivity(`Resource request ${r.granted?"granted":"not granted"}`,`${pLabel(pid)} requested ${vec(request)}.`,r.granted?"✓":"!");
    renderAll();
    // renderAll rebuilds inputs, so restore the transaction result after the state refresh.
    $("#requestResult").innerHTML=`<div class="result-card ${cls}"><div class="result-title"><span class="result-mark">${r.granted?"✓":r.status==="Waiting"?"⌛":"!"}</span>${esc(r.status)}</div><p>${esc(r.message)}</p>${r.granted?`<div class="sequence-line">UPDATED AVAILABLE &nbsp; ${vec(state.available)}</div><div class="sequence-line">UPDATED ALLOCATION · ${pLabel(pid)} &nbsp; ${vec(state.allocation[pid])}</div>${resultHTML(r.safety,"Post-grant safety")}`:""}${r.safety&&!r.granted?resultHTML(r.safety,"Trial state"):""}</div>`;
  };
  $("#clearRequest").onclick=()=>{$$("[data-request]").forEach(i=>i.value=0);$("#requestResult").innerHTML=`<div class="empty-state"><div class="empty-icon">⇄</div><h3>Awaiting request</h3><p>Configure a process and resource vector, then validate the request.</p></div>`;};
  renderRequestLimits();
}
function renderRequestLimits(){
  const pid=Number($("#requestProcess").value)||0,need=needMatrix()[pid];
  $("#requestLimits").innerHTML=state.resources.map((r,j)=>`<div class="request-limit-row"><span class="res-tag">${r}</span><span>Need / Available</span><b>${need[j]} / ${state.available[j]}</b></div>`).join("");
}
function operationInputs(container,prefix){
  $(container).innerHTML=state.resources.map(r=>`<div class="operation-input"><label>${prefix} ${r}</label><input type="number" min="0" step="1" value="0" data-op="${prefix}-${r}" aria-label="${prefix} ${r}"></div>`).join("");
}
function getOperationValues(prefix){return state.resources.map(r=>Number($(`[data-op="${prefix}-${r}"]`).value));}
function projectionHTML(before,after){
  return `<div class="projection-vectors"><div class="projection-row"><span>Current</span><div class="projection-chips">${before.map((v,j)=>`<span class="projection-chip">${state.resources[j]}: ${v}</span>`).join("")}</div></div><div class="projection-row"><span>Proposed</span><div class="projection-chips">${after.map((v,j)=>`<span class="projection-chip">${state.resources[j]}: ${v}</span>`).join("")}</div></div></div>`;
}
function renderAddition(){
  operationInputs("#additionInputs","Add");
  $("#previewAddition").onclick=()=>{
    const add=getOperationValues("Add");
    if(add.some(v=>!Number.isInteger(v)||v<0)){toast("Use non-negative whole numbers.","error");return;}
    const proposed=state.available.map((v,j)=>v+add[j]),r=safetyCheck(state.allocation,state.maximum,proposed);
    $("#additionPreview").innerHTML=projectionHTML(state.available,proposed);
    $("#additionResult").innerHTML=resultHTML(r,"Addition preview");
    if(r.valid&&r.safe){
      const commit=document.createElement("button");commit.className="btn btn-primary";commit.textContent="✓ Confirm & apply addition";
      commit.onclick=()=>{state.available=proposed;addActivity("Resources added",`Added ${vec(add)}. New Available ${vec(proposed)}.`,"＋");renderAll();toast("Addition accepted. State remains safe.","success");};
      $("#additionResult").appendChild(commit);
    } else $("#additionResult").insertAdjacentHTML("beforeend",`<p class="muted">Addition has not been applied. The current state is unchanged.</p>`);
  };
}
function renderRemoval(){
  operationInputs("#removalInputs","Remove");
  $("#previewRemoval").onclick=()=>{
    const rem=getOperationValues("Remove");
    if(rem.some(v=>!Number.isInteger(v)||v<0)){toast("Use non-negative whole numbers.","error");return;}
    const tooMuch=rem.some((v,j)=>v>state.available[j]);
    if(tooMuch){
      $("#removalPreview").innerHTML=projectionHTML(state.available,state.available.map((v,j)=>v-rem[j]));
      $("#removalResult").innerHTML=`<div class="result-card danger"><div class="result-title"><span class="result-mark">!</span>Physically impossible</div><p>Removal exceeds Available for ${rem.map((v,j)=>v>state.available[j]?state.resources[j]:null).filter(Boolean).join(", ")}. No changes were made.</p></div>`;
      return;
    }
    const proposed=state.available.map((v,j)=>v-rem[j]),r=safetyCheck(state.allocation,state.maximum,proposed);
    $("#removalPreview").innerHTML=projectionHTML(state.available,proposed);
    $("#removalResult").innerHTML=resultHTML(r,"Removal preview");
    if(r.valid&&r.safe){
      const commit=document.createElement("button");commit.className="btn btn-primary";commit.textContent="✓ Confirm & apply removal";
      commit.onclick=()=>{state.available=proposed;addActivity("Resources removed",`Removed ${vec(rem)}. New Available ${vec(proposed)}.`,"－");renderAll();toast("Removal accepted. State remains safe.","success");};
      $("#removalResult").appendChild(commit);
    } else $("#removalResult").insertAdjacentHTML("beforeend",`<p class="muted">Removal rejected. The original Available vector is preserved.</p>`);
  };
}
function renderDetection(){
  const custom=$("#detectionScenario").value==="custom";
  $("#detectionCustom").classList.toggle("hidden",!custom);
  $("#detectionScenario").onchange=renderDetection;
  $("#runDetection").onclick=()=>{
    let alloc,req,total,res;
    if(!custom){alloc=[[1,0],[0,1]];req=[[0,1],[1,0]];total=[1,1];res=["R1","R2"];}
    else{
      const parseRows=id=>$(id).value.trim().split(/\n+/).map(row=>row.split(",").map(x=>Number(x.trim())));
      total=$("#detectionTotal").value.split(",").map(x=>Number(x.trim()));
      alloc=parseRows("#detectionAllocation");req=parseRows("#detectionRequests");res=total.map((_,i)=>`R${i+1}`);
    }
    const r=detectDeadlock(alloc,req,total);
    if(!r.valid){$("#detectionResult").innerHTML=`<div class="result-card danger"><div class="result-title">Invalid detection input</div><p>${esc(r.error)}</p></div>`;return;}
    $("#detectionResult").innerHTML=`<div class="result-card ${r.isDeadlocked?"danger":"success"}"><div class="result-title"><span class="result-mark">${r.isDeadlocked?"!":"✓"}</span>${r.isDeadlocked?"Deadlock detected":"No deadlocked processes detected"}</div><p>Calculated Available: ${vec(r.available)}. ${r.isDeadlocked?"Unfinished processes: "+r.deadlocked.join(", "):"All processes can finish under the detection algorithm."}</p></div>`;
    if(r.steps.length)$("#detectionResult").insertAdjacentHTML("beforeend",tableHTML(["Process","Request","Work before","Released","Work after"],r.steps.map(s=>[s.process,vec(s.request),vec(s.before),vec(s.released),vec(s.after)])));
    addActivity("Deadlock detection run",r.isDeadlocked?`Unfinished: ${r.deadlocked.join(", ")}`:"No deadlocked processes.","⌕");
  };
}
function runTestSuite(){
  const tests=[];
  const add=(id,name,expected,actual,pass,detail)=>tests.push({id,name,expected,actual,pass,detail});
  let r=safetyCheck(CLASSIC.allocation,CLASSIC.maximum,CLASSIC.available);
  add("T01","Classic initial state","Safe",r.safe?"Safe":"Unsafe",r.valid&&r.safe,"Safe sequence: "+r.sequence.join(" → "));
  r=requestResourcesFor(CLASSIC,0,[4,0,0]);
  add("T02","Request exceeds Available","Waiting",r.status,r.status==="Waiting",r.message);
  r=requestResourcesFor(CLASSIC,4,[3,3,0]);
  add("T03","Request would create unsafe state","Denied — unsafe",r.status,r.status==="Denied — unsafe",r.message);
  const addAvailable=CLASSIC.available.map((v,j)=>v+[1,0,0][j]);
  r=safetyCheck(CLASSIC.allocation,CLASSIC.maximum,addAvailable);
  add("T04","Add one A resource","Safe",r.safe?"Safe":"Unsafe",r.valid&&r.safe,`Available ${vec(CLASSIC.available)} → ${vec(addAvailable)}`);
  const remAvailable=[3,0,2];
  r=safetyCheck(CLASSIC.allocation,CLASSIC.maximum,remAvailable);
  add("T05","Remove all available B","Unsafe / reject",r.safe?"Safe":"Unsafe",r.valid&&!r.safe,`Proposed Available ${vec(remAvailable)}`);
  r=detectDeadlock([[1,0],[0,1]],[[0,1],[1,0]],[1,1]);
  add("T06","Two-process circular wait","P0 and P1 deadlocked",r.deadlocked.join(", "),r.valid&&new Set(r.deadlocked).size===2,"P0 waits for R2; P1 waits for R1.");
  return tests;
}
function requestResourcesFor(profile,pid,request){
  const saved=state;state=clone(profile);const result=requestResources(pid,request);state=saved;return result;
}
function renderTests(){
  const rows=runTestSuite();lastTestRows=rows;
  const passed=rows.filter(r=>r.pass).length;
  $("#testSummary").innerHTML=[
    ["Checks executed",rows.length,"SCENARIOS"],
    ["Passed",passed,"EXPECTED BEHAVIOR"],
    ["Failed",rows.length-passed,"NEEDS REVIEW"],
    ["Pass rate",`${Math.round(passed/rows.length*100)}%`,"AUTOMATED"]
  ].map((m,i)=>`<div class="metric"><div class="metric-top"><span>${m[0]}</span><span class="metric-symbol">${["✓","✓","!","%"][i]}</span></div><div class="metric-value" style="color:${i===1?"var(--teal)":i===2&&m[1]>0?"var(--red)":"var(--text)"}">${m[1]}</div><div class="metric-note">${m[2]}</div></div>`).join("");
  $("#testTable").innerHTML=tableHTML(["ID","Scenario","Expected","Actual","Result","Details"],rows.map(r=>[r.id,esc(r.name),esc(r.expected),esc(r.actual),`<span class="${r.pass?"pass-pill":"fail-pill"}">${r.pass?"PASS":"FAIL"}</span>`,esc(r.detail)]));
}
function renderPrevention(){
  const strategies={
    mutual:{title:"Mutual exclusion",condition:"A resource can be used by only one process at a time.",method:"Make resources shareable where possible.",example:"Read-only files can often be shared by multiple processes.",tradeoff:"Some resources, such as a printer while printing, are inherently non-shareable. This condition cannot always be eliminated.",number:"01"},
    hold:{title:"Hold and wait",condition:"A process holds one or more resources while waiting for additional resources.",method:"Require a process to request all resources it needs at once, before it begins, or require it to release held resources before requesting more.",example:"A process reserves its required printer and scanner together before execution.",tradeoff:"Can reduce resource utilization and may cause a process to wait longer before it starts.",number:"02"},
    noPreempt:{title:"No preemption",condition:"Resources cannot normally be forcibly taken from a process holding them.",method:"If a process requests a resource that is unavailable, require it to release its currently held resources; it can retry later.",example:"A process releases its held resources when its next required resource cannot be granted.",tradeoff:"Works only for resources whose state can safely be saved and restored; it is not suitable for every resource.",number:"03"},
    circular:{title:"Circular wait",condition:"A cycle exists where each process waits for a resource held by the next process in the cycle.",method:"Assign a strict global order to resource types and require processes to request resources only in increasing order.",example:"If resource order is A < B < C, a process holding C cannot then request A.",tradeoff:"Resource ordering is relatively practical, but the chosen order may restrict flexibility.",number:"04"}
  };
  const cards=[
    ["01","Mutual exclusion","Make resources shareable when possible; some resources are inherently exclusive."],
    ["02","Hold and wait","Request all resources together or release held resources before asking for more."],
    ["03","No preemption","Allow safe resource preemption or require processes to release resources before retrying."],
    ["04","Circular wait","Use a strict ordering of resource types and request them only in that order."]
  ];
  const paint=()=>{
    const key=$("#preventionStrategy")?.value||"mutual",v=strategies[key];
    $("#preventionExplanation").innerHTML=`<div class="panel-heading"><div><div class="panel-eyebrow">STRATEGY DETAILS</div><h3>${v.title}</h3></div><span class="matrix-tag">CONDITION ${v.number}</span></div><div class="prevention-content"><div class="prevention-point"><span class="point-icon">!</span><div><b>What the condition means</b><p>${v.condition}</p></div></div><div class="prevention-point"><span class="point-icon">✓</span><div><b>How to prevent it</b><p>${v.method}</p></div></div><div class="prevention-point"><span class="point-icon">⌘</span><div><b>Example</b><p>${v.example}</p></div></div><div class="prevention-tradeoff"><b>Trade-off to mention</b><p>${v.tradeoff}</p></div></div>`;
    $("#preventionChecks").innerHTML=Object.entries(strategies).map(([k,x])=>`<div class="prevention-condition ${k===key?'selected':''}"><span class="condition-number">${x.number}</span><div><b>${x.title}</b><small>${x.condition}</small></div>${k===key?'<span class="condition-selected">SELECTED</span>':''}</div>`).join("");
  };
  const select=$("#preventionStrategy");
  if(select&&!select.dataset.bound){select.addEventListener("change",paint);select.dataset.bound="true";}
  $("#preventionCards").innerHTML=cards.map(c=>`<article class="concept-card"><div class="concept-number">CONDITION / ${c[0]}</div><h3>${c[1]}</h3><p>${c[2]}</p></article>`).join("");
  paint();
}
function renderAll(){
  renderOverview();renderBanker();renderRequest();renderDetection();renderPrevention();
  const active=$(".page.active")?.id?.replace("page-","");
  if(active==="tests"&&lastTestRows.length)renderTests();
}
function toast(message,type="success"){
  const node=document.createElement("div");node.className=`toast ${type}`;node.textContent=message;$("#toastRegion").appendChild(node);setTimeout(()=>node.remove(),3000);
}
function showPage(page){
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  $$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  const label=$(`.nav-item[data-page="${page}"] span:nth-child(2)`)?.textContent||page;
  $("#crumbCurrent").textContent=label.toUpperCase();
  $("#sidebar").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
}
$$(".nav-item").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.page)));
$$("[data-goto]").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.goto)));
$("#mobileMenu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#loadScenario").onclick=()=>{reset($("#scenarioSelect").value);toast("Scenario loaded.");};
$("#resetScenario").onclick=()=>{reset("classic");$("#scenarioSelect").value="classic";toast("Classic scenario restored.");};
$("#runTests").onclick=()=>{renderTests();toast("Test suite completed.");};
$("#downloadTests").onclick=()=>{
  if(!lastTestRows.length)renderTests();
  const headers=["id","name","expected","actual","pass","detail"];
  const csv=[headers.join(","),...lastTestRows.map(r=>headers.map(h=>`"${String(r[h]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="deadlock_os_test_report.csv";a.click();URL.revokeObjectURL(url);
};
$("#detectionScenario").addEventListener("change",renderDetection);
reset("classic",false);
renderTests();
