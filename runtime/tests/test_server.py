import os
import unittest
import tempfile
from pathlib import Path
import httpx
from runtime import server
from runtime.core import Runtime

class LocalServerTests(unittest.IsolatedAsyncioTestCase):
 async def test_auth_host_and_local_endpoint(self):
  old=server.TOKEN;server.TOKEN='s'*32
  try:
   transport=httpx.ASGITransport(app=server.app)
   async with httpx.AsyncClient(transport=transport,base_url='http://127.0.0.1:8765') as client:
    self.assertEqual((await client.get('/health')).status_code,401)
    result=await client.get('/health',headers={'Authorization':'Bearer '+'s'*32})
    self.assertEqual(result.status_code,200)
    self.assertEqual(result.json()['isolation'],'managed_profile')
    result=await client.get('/health',headers={'Authorization':'Bearer '+'s'*32,'Origin':'https://malicious.example'})
    self.assertEqual(result.status_code,403)
   async with httpx.AsyncClient(transport=transport,base_url='http://127.0.0.1:8765') as client:
    auth={'Authorization':'Bearer '+'s'*32}
    self.assertEqual((await client.post('/tasks/nonexistent/decision',headers=auth,
       json={'request_id':'a'*32,'decision':'approve'})).status_code,404)
   async with httpx.AsyncClient(transport=transport,base_url='http://attacker.invalid:8765') as client:
    result=await client.get('/health',headers={'Authorization':'Bearer '+'s'*32})
    self.assertEqual(result.status_code,403)
  finally:server.TOKEN=old

if __name__=='__main__':unittest.main()
