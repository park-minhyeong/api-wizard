#!/usr/bin/env node

/**
 * API Wizard 안정성 테스트
 * 
 * 테스트 시나리오:
 * 1. contentType 미지정 - 기본 JSON 처리
 * 2. contentType: "application/json" - 명시적 JSON 처리
 * 3. contentType: "multipart/form-data" - FormData 자동 변환
 * 
 * 각 케이스에서 검증:
 * - 헤더 보존 확인
 * - body 파싱 확인
 * - interceptor에서 Headers 인스턴스 보존 확인
 */

import { handler } from './dist/index.js';
import { Readable } from 'stream';

// 테스트 결과 추적
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// 테스트 헬퍼
function test(name, fn) {
  return async () => {
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: 'PASS', error: null });
      console.log(`✅ ${name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
      console.error(`❌ ${name}: ${error.message}`);
      console.error(error.stack);
    }
  };
}

// HTTP 요청 모킹을 위한 간단한 서버
let server;
let serverUrl;

async function startMockServer() {
  const http = await import('http');
  
  server = http.createServer((req, res) => {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      const response = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body,
        contentType: req.headers['content-type'],
        hasBody: body.length > 0
      };
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'X-Test-Header': 'test-value'
      });
      res.end(JSON.stringify(response));
    });
  });
  
  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      resolve();
    });
  });
}

function stopMockServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

// Node.js에서 FormData 사용을 위한 polyfill
async function setupFormDataPolyfill() {
  if (typeof FormData === 'undefined') {
    // Node.js 18+에서는 FormData가 내장되어 있음
    // 없으면 undici 사용
    try {
      const { FormData, File, Blob } = await import('undici');
      global.FormData = FormData;
      global.File = File;
      global.Blob = Blob;
    } catch (e) {
      console.warn('FormData polyfill을 사용할 수 없습니다. Node.js 18+를 사용하세요.');
    }
  }
}

// 테스트 실행
async function runTests() {
  console.log('🚀 API Wizard 안정성 테스트 시작\n');
  
  await setupFormDataPolyfill();
  await startMockServer();
  
  try {
    // 테스트 1: contentType 미지정 - 기본 JSON 처리
    await (test('1. contentType 미지정 - 기본 JSON 처리', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const testData = { name: 'John', age: 30 };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 헤더 확인 - contentType 미지정 시 기본값으로 application/json 설정되어야 함
      if (!result.headers['content-type'] || !result.headers['content-type'].includes('application/json')) {
        throw new Error('Content-Type이 application/json으로 설정되지 않음 (기본값)');
      }
      
      // body가 JSON 형식인지 확인
      if (!result.body.startsWith('{') || !result.body.includes('"name":"John"')) {
        throw new Error('Body가 JSON 형식이 아님');
      }
      
      // body 파싱 확인
      const parsedBody = JSON.parse(result.body);
      if (parsedBody.name !== 'John' || parsedBody.age !== 30) {
        throw new Error('Body 파싱 실패');
      }
      
      // 응답 헤더 보존 확인
      if (response.headers.get('x-test-header') !== 'test-value') {
        throw new Error('응답 헤더 보존 실패');
      }
    }))();
    
    // 테스트 2: contentType: "application/json" - 명시적 JSON 처리
    await (test('2. contentType: "application/json" - 명시적 JSON 처리', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'application/json'
      });
      
      const testData = { name: 'Jane', age: 25 };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 헤더 확인
      if (!result.headers['content-type'] || !result.headers['content-type'].includes('application/json')) {
        throw new Error('Content-Type이 application/json으로 설정되지 않음');
      }
      
      // body 파싱 확인
      const parsedBody = JSON.parse(result.body);
      if (parsedBody.name !== 'Jane' || parsedBody.age !== 25) {
        throw new Error('Body 파싱 실패');
      }
    }))();
    
    // 테스트 3: contentType: "multipart/form-data" - FormData 자동 변환
    await (test('3. contentType: "multipart/form-data" - FormData 자동 변환', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'multipart/form-data'
      });
      
      const testData = {
        name: 'Bob',
        age: 35,
        tags: ['tag1', 'tag2'],
        nested: {
          key: 'value'
        }
      };
      
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // Content-Type이 multipart/form-data로 시작하는지 확인 (boundary 포함)
      if (!result.headers['content-type'] || !result.headers['content-type'].startsWith('multipart/form-data')) {
        throw new Error(`Content-Type이 multipart/form-data로 설정되지 않음. 실제: ${result.headers['content-type']}`);
      }
      
      // boundary가 포함되어 있는지 확인
      if (!result.headers['content-type'].includes('boundary=')) {
        throw new Error('Content-Type에 boundary가 포함되지 않음');
      }
      
      // body가 비어있지 않은지 확인 (FormData는 바이너리 데이터)
      if (!result.hasBody) {
        throw new Error('FormData body가 비어있음');
      }
    }))();
    
    // 테스트 4: interceptor에서 Headers 인스턴스 보존
    await (test('4. interceptor에서 Headers 인스턴스 보존', async () => {
      let headersPreserved = false;
      
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // Headers 인스턴스인지 확인
            if (config.headers instanceof Headers || 
                (config.headers && typeof config.headers.set === 'function')) {
              headersPreserved = true;
              // Headers에 커스텀 헤더 추가
              config.headers.set('X-Custom-Header', 'custom-value');
            }
            return config;
          }
        }
      });
      
      const testData = { name: 'Alice' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'X-Original-Header': 'original-value'
        }
      });
      
      const result = response.data;
      
      // Headers 인스턴스가 보존되었는지 확인
      if (!headersPreserved) {
        throw new Error('Headers 인스턴스가 보존되지 않음');
      }
      
      // 커스텀 헤더가 전달되었는지 확인
      if (result.headers['x-custom-header'] !== 'custom-value') {
        throw new Error('interceptor에서 추가한 헤더가 전달되지 않음');
      }
      
      // 원본 헤더도 보존되었는지 확인
      if (result.headers['x-original-header'] !== 'original-value') {
        throw new Error('원본 헤더가 보존되지 않음');
      }
    }))();
    
    // 테스트 5: FormData 직접 전달 (자동 변환 없이)
    await (test('5. FormData 직접 전달', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const formData = new FormData();
      formData.append('name', 'Charlie');
      formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');
      
      const response = await api.test().post('/test', formData);
      
      const result = response.data;
      
      // Content-Type이 multipart/form-data로 시작하는지 확인
      if (!result.headers['content-type'] || !result.headers['content-type'].startsWith('multipart/form-data')) {
        throw new Error(`Content-Type이 multipart/form-data로 설정되지 않음. 실제: ${result.headers['content-type']}`);
      }
      
      // boundary가 포함되어 있는지 확인
      if (!result.headers['content-type'].includes('boundary=')) {
        throw new Error('Content-Type에 boundary가 포함되지 않음');
      }
    }))();
    
    // 테스트 6: multipart/form-data + File 객체
    await (test('6. multipart/form-data + File 객체', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'multipart/form-data'
      });
      
      // Node.js 환경에서 File 생성 (없으면 Blob 사용)
      const fileContent = Buffer.from('file content');
      let file;
      if (typeof File !== 'undefined') {
        file = new File([fileContent], 'test.txt', { type: 'text/plain' });
      } else {
        // File이 없으면 Blob 사용
        file = new Blob([fileContent], { type: 'text/plain' });
      }
      
      const testData = {
        name: 'David',
        file: file,
        tags: ['tag1', 'tag2']
      };
      
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // Content-Type 확인
      if (!result.headers['content-type'] || !result.headers['content-type'].startsWith('multipart/form-data')) {
        throw new Error(`Content-Type이 multipart/form-data로 설정되지 않음. 실제: ${result.headers['content-type']}`);
      }
      
      // body가 비어있지 않은지 확인
      if (!result.hasBody) {
        throw new Error('FormData body가 비어있음');
      }
    }))();
    
    // 테스트 7: PUT 메서드에서 multipart/form-data
    await (test('7. PUT 메서드에서 multipart/form-data', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'multipart/form-data'
      });
      
      const testData = {
        id: 1,
        name: 'Eve',
        updated: true
      };
      
      const response = await api.test().put('/test/1', testData);
      
      const result = response.data;
      
      // 메서드 확인
      if (result.method !== 'PUT') {
        throw new Error(`메서드가 PUT이 아님. 실제: ${result.method}`);
      }
      
      // Content-Type 확인
      if (!result.headers['content-type'] || !result.headers['content-type'].startsWith('multipart/form-data')) {
        throw new Error(`Content-Type이 multipart/form-data로 설정되지 않음. 실제: ${result.headers['content-type']}`);
      }
    }))();
    
    // 테스트 8: PATCH 메서드에서 multipart/form-data
    await (test('8. PATCH 메서드에서 multipart/form-data', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'multipart/form-data'
      });
      
      const testData = {
        name: 'Frank'
      };
      
      const response = await api.test().patch('/test/1', testData);
      
      const result = response.data;
      
      // 메서드 확인
      if (result.method !== 'PATCH') {
        throw new Error(`메서드가 PATCH가 아님. 실제: ${result.method}`);
      }
      
      // Content-Type 확인
      if (!result.headers['content-type'] || !result.headers['content-type'].startsWith('multipart/form-data')) {
        throw new Error(`Content-Type이 multipart/form-data로 설정되지 않음. 실제: ${result.headers['content-type']}`);
      }
    }))();
    
    // 테스트 9: 중첩 객체를 multipart/form-data로 변환
    await (test('9. 중첩 객체를 multipart/form-data로 변환', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'multipart/form-data'
      });
      
      const testData = {
        user: {
          name: 'Grace',
          profile: {
            age: 28,
            city: 'Seoul'
          }
        },
        tags: ['tag1', 'tag2', 'tag3']
      };
      
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // Content-Type 확인
      if (!result.headers['content-type'] || !result.headers['content-type'].startsWith('multipart/form-data')) {
        throw new Error(`Content-Type이 multipart/form-data로 설정되지 않음. 실제: ${result.headers['content-type']}`);
      }
      
      // body가 비어있지 않은지 확인
      if (!result.hasBody) {
        throw new Error('FormData body가 비어있음');
      }
    }))();
    
    // 테스트 10: form-urlencoded 처리
    await (test('10. application/x-www-form-urlencoded 처리', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'application/x-www-form-urlencoded'
      });
      
      const testData = {
        name: 'Henry',
        age: 40
      };
      
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // Content-Type 확인
      if (!result.headers['content-type'] || !result.headers['content-type'].includes('application/x-www-form-urlencoded')) {
        throw new Error(`Content-Type이 application/x-www-form-urlencoded로 설정되지 않음. 실제: ${result.headers['content-type']}`);
      }
      
      // body가 URLSearchParams 형식인지 확인
      if (!result.body.includes('name=Henry') || !result.body.includes('age=40')) {
        throw new Error('Body가 URLSearchParams 형식이 아님');
      }
    }))();
    
  } finally {
    await stopMockServer();
  }
  
  // 결과 출력
  console.log('\n📊 테스트 결과:');
  console.log(`✅ 통과: ${results.passed}`);
  console.log(`❌ 실패: ${results.failed}`);
  console.log(`📈 총 테스트: ${results.passed + results.failed}\n`);
  
  if (results.failed > 0) {
    console.log('실패한 테스트:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
      });
    process.exit(1);
  } else {
    console.log('🎉 모든 테스트 통과!');
    process.exit(0);
  }
}

// 실행
runTests().catch(error => {
  console.error('테스트 실행 중 오류:', error);
  process.exit(1);
});
