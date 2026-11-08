(() => {
  const M=window.SYS_MODEL,S=window.SYS_STORE;
  function start(execution,step){const startedAt=Date.now();S.state.timer={id:M.uid('timer'),executionId:execution.id,stepId:step.id,startedAt,dueAt:startedAt+step.timerSeconds*1000,durationSeconds:step.timerSeconds};S.save();}
  function stop(){S.state.timer=null;S.save();}
  function label(t,now=Date.now()){
    const delta=t.dueAt-now,n=delta>0?Math.ceil(delta/1000):Math.floor(-delta/1000);
    return delta>0?`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`已到时${n?` · 超时${Math.floor(n/60)?Math.floor(n/60)+'分':''}${n%60}秒`:''}`;
  }
  window.SYS_TIMER={start,stop,label};
})();
