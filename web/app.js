async function api(path, method='GET', body=null){
  const opts = {method, headers:{'Content-Type':'application/json'}}
  if(body) opts.body = JSON.stringify(body)
  const res = await fetch('http://localhost:5000'+path, opts)
  return res.json()
}

document.getElementById('createBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('name').value
  const specialty = document.getElementById('specialty').value
  const base_stat = Number(document.getElementById('base_stat').value)
  const res = await api('/create','POST',{name,specialty,base_stat})
  document.getElementById('stateView').textContent = JSON.stringify(res, null, 2)
})

document.getElementById('weekBtn').addEventListener('click', async ()=>{
  const training = Number(document.getElementById('training').value)
  const attend = document.getElementById('attend').checked
  const res = await api('/week','POST',{training_load: training, attend_meet: attend})
  document.getElementById('stateView').textContent = JSON.stringify(res, null, 2)
})

// load state on start
(async ()=>{
  try{
    const s = await api('/state')
    document.getElementById('stateView').textContent = JSON.stringify(s, null, 2)
  }catch(e){
    // no saved athlete or server offline
  }
})()
