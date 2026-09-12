const test=require('node:test');
const assert=require('node:assert/strict');
const {BackGesture}=require('../gesture.js');
const feed=(samples)=>{const g=new BackGesture();let early=false;samples.forEach((s,i)=>{early=g.add({x:s[0],y:s[1]||0,time:i*20,blocked:s[2]||false})||early;});return {g,early};};
test('backward pixel input qualifies without a click',()=>{assert.equal(feed([[-30],[-70],[-100]]).g.qualifies(),true);});
test('vertical, forward, diagonal, tiny, or single-event movement never closes',()=>{
  for(const s of [[[0,100],[0,100],[0,100]],[[100],[100],[100]],[[-80,80],[-80,80],[-80,80]],[[-5],[-5],[-5]],[[-900]]]) assert.equal(feed(s).g.qualifies(),false);
});
test('reversing a pending swipe cancels it for the entire gesture',()=>{assert.equal(feed([[-100],[-100],[-100],[15],[-100]]).g.qualifies(),false);});
test('scrollable content or modifier blocks the entire gesture',()=>{assert.equal(feed([[-80,0,true],[-100],[-100]]).g.qualifies(),false);});
test('deceleration allows an early close before the momentum tail ends',()=>{
  assert.equal(feed([[-2],[-16],[-30],[-66],[-174],[-348],[-426],[-412],[-394],[-374],[-352],[-336]]).early,true);
});
test('reset permits a new gesture after rejected input',()=>{const {g}=feed([[50],[100]]);g.reset();for(let i=0;i<4;i++)g.add({x:-60,y:0,time:i*20});assert.equal(g.qualifies(),true);});
