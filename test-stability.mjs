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
    
    // 테스트 11: onRequest에서 Headers를 일반 객체로 변환해도 자동 재변환
    await (test('11. onRequest에서 Headers를 일반 객체로 변환해도 자동 재변환', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // Headers를 일반 객체로 변환
            config.headers = {
              ...config.headers,
              'Custom-Header': 'custom-value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token123',
          'X-Original-Header': 'original-value'
        }
      });
      
      const result = response.data;
      
      // Authorization 헤더가 보존되어야 함
      if (result.headers['authorization'] !== 'Bearer token123') {
        throw new Error(`Authorization 헤더가 보존되지 않음. 실제: ${result.headers['authorization']}`);
      }
      
      // 원본 헤더도 보존되어야 함
      if (result.headers['x-original-header'] !== 'original-value') {
        throw new Error(`원본 헤더가 보존되지 않음. 실제: ${result.headers['x-original-header']}`);
      }
      
      // 커스텀 헤더도 추가되어야 함
      if (result.headers['custom-header'] !== 'custom-value') {
        throw new Error(`커스텀 헤더가 추가되지 않음. 실제: ${result.headers['custom-header']}`);
      }
    }))();
    
    // 테스트 12: onRequest에서 Headers.set() 사용 시 재변환 없음 (성능 최적화)
    await (test('12. onRequest에서 Headers.set() 사용 시 재변환 없음', async () => {
      let headersConverted = false;
      
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // Headers 인스턴스 보존
            if (config.headers instanceof Headers) {
              config.headers.set('Custom-Header', 'custom-value');
            } else {
              headersConverted = true; // 재변환 발생
            }
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token456'
        }
      });
      
      const result = response.data;
      
      // Authorization 헤더가 보존되어야 함
      if (result.headers['authorization'] !== 'Bearer token456') {
        throw new Error(`Authorization 헤더가 보존되지 않음`);
      }
      
      // 커스텀 헤더도 추가되어야 함
      if (result.headers['custom-header'] !== 'custom-value') {
        throw new Error(`커스텀 헤더가 추가되지 않음`);
      }
      
      // Headers.set()을 사용했으므로 재변환되지 않아야 함 (성능 최적화)
      if (headersConverted) {
        throw new Error('Headers.set() 사용 시에도 재변환이 발생함 (성능 최적화 실패)');
      }
    }))();
    
    // 테스트 13: Headers가 null/undefined인 경우
    await (test('13. Headers가 null/undefined인 경우', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = null;
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // null 헤더가 처리되어야 함
      if (result.headers === undefined) {
        throw new Error('null 헤더가 처리되지 않음');
      }
    }))();
    
    // 테스트 14: Headers가 배열인 경우
    await (test('14. Headers가 배열인 경우', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = [['Authorization', 'Bearer token'], ['Content-Type', 'application/json']];
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 배열 헤더가 처리되어야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('배열 헤더가 처리되지 않음');
      }
    }))();
    
    // 테스트 15: onRequest에서 헤더를 완전히 교체하는 경우
    await (test('15. onRequest에서 헤더를 완전히 교체하는 경우', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              'New-Header': 'new-value',
              'Another-Header': 'another-value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Original-Header': 'original-value'
        }
      });
      
      const result = response.data;
      
      // 새 헤더가 설정되어야 함
      if (result.headers['new-header'] !== 'new-value') {
        throw new Error('새 헤더가 설정되지 않음');
      }
      
      // 원본 헤더는 보존되어야 함 (자동 재변환 시)
      if (result.headers['original-header'] !== 'original-value') {
        throw new Error('원본 헤더가 보존되지 않음');
      }
    }))();
    
    // 테스트 16: onRequest에서 헤더를 제거하는 경우
    await (test('16. onRequest에서 헤더를 제거하는 경우', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            if (config.headers instanceof Headers) {
              config.headers.delete('Authorization');
            } else if (config.headers && typeof config.headers === 'object') {
              const newHeaders = { ...config.headers };
              delete newHeaders.Authorization;
              config.headers = newHeaders;
            }
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token',
          'X-Keep-Header': 'keep-value'
        }
      });
      
      const result = response.data;
      
      // Authorization 헤더가 제거되어야 함
      if (result.headers['authorization']) {
        throw new Error('Authorization 헤더가 제거되지 않음');
      }
      
      // 다른 헤더는 보존되어야 함
      if (result.headers['x-keep-header'] !== 'keep-value') {
        throw new Error('다른 헤더가 보존되지 않음');
      }
    }))();
    
    // 테스트 17: tokenConfig와 onRequest가 함께 사용되는 경우
    await (test('17. tokenConfig와 onRequest가 함께 사용되는 경우', async () => {
      let token = 'test-token-123';
      
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Custom-Header': 'custom-value'
            };
            return config;
          },
          tokenConfig: {
            getToken: () => token,
            formatAuthHeader: (t) => ({ 'Authorization': `Bearer ${t}` })
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'X-Original': 'original'
        }
      });
      
      const result = response.data;
      
      // Authorization 헤더가 추가되어야 함
      if (result.headers['authorization'] !== 'Bearer test-token-123') {
        throw new Error('tokenConfig의 Authorization 헤더가 추가되지 않음');
      }
      
      // 커스텀 헤더도 추가되어야 함
      if (result.headers['custom-header'] !== 'custom-value') {
        throw new Error('onRequest의 커스텀 헤더가 추가되지 않음');
      }
      
      // 원본 헤더도 보존되어야 함
      if (result.headers['x-original'] !== 'original') {
        throw new Error('원본 헤더가 보존되지 않음');
      }
    }))();
    
    // 테스트 18: 빈 객체로 변환하는 경우
    await (test('18. 빈 객체로 변환하는 경우', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {};
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // 빈 객체가 처리되어야 함 (원본 헤더는 보존되어야 함)
      // 실제로는 원본 Headers가 있었으므로 재변환 시 병합됨
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('빈 객체로 변환 시 원본 헤더가 보존되지 않음');
      }
    }))();
    
    // 테스트 19: 여러 헤더를 동시에 추가하는 경우
    await (test('19. 여러 헤더를 동시에 추가하는 경우', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Header-1': 'value-1',
              'Header-2': 'value-2',
              'Header-3': 'value-3'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Original': 'original-value'
        }
      });
      
      const result = response.data;
      
      // 모든 헤더가 추가되어야 함
      if (result.headers['header-1'] !== 'value-1' ||
          result.headers['header-2'] !== 'value-2' ||
          result.headers['header-3'] !== 'value-3') {
        throw new Error('여러 헤더가 모두 추가되지 않음');
      }
      
      // 원본 헤더도 보존되어야 함
      if (result.headers['original'] !== 'original-value') {
        throw new Error('원본 헤더가 보존되지 않음');
      }
    }))();
    
    // 테스트 20: Headers.set()과 일반 객체 변환 혼합 사용
    await (test('20. Headers.set()과 일반 객체 변환 혼합 사용', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            if (config.headers instanceof Headers) {
              config.headers.set('Set-Method-Header', 'set-value');
            }
            // 그 다음 일반 객체로 변환
            config.headers = {
              ...config.headers,
              'Object-Header': 'object-value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Original': 'original-value'
        }
      });
      
      const result = response.data;
      
      // Headers.set()으로 추가한 헤더가 보존되어야 함
      if (result.headers['set-method-header'] !== 'set-value') {
        throw new Error('Headers.set()으로 추가한 헤더가 보존되지 않음');
      }
      
      // 일반 객체로 추가한 헤더도 추가되어야 함
      if (result.headers['object-header'] !== 'object-value') {
        throw new Error('일반 객체로 추가한 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 21: undefined/null 값을 가진 헤더 처리
    await (test('21. undefined/null 값을 가진 헤더 처리', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Valid-Header': 'valid-value',
              'Undefined-Header': undefined,
              'Null-Header': null
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 유효한 헤더만 추가되어야 함
      if (result.headers['valid-header'] !== 'valid-value') {
        throw new Error('유효한 헤더가 추가되지 않음');
      }
      
      // undefined/null 헤더는 추가되지 않아야 함
      if (result.headers['undefined-header'] !== undefined || result.headers['null-header'] !== undefined) {
        throw new Error('undefined/null 헤더가 추가됨');
      }
    }))();
    
    // 테스트 22: GET 요청에서도 헤더 보존 확인
    await (test('22. GET 요청에서도 헤더 보존 확인', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Custom-Header': 'get-value'
            };
            return config;
          }
        }
      });
      
      const response = await api.test().get('/test', {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // Authorization 헤더가 보존되어야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('GET 요청에서 Authorization 헤더가 보존되지 않음');
      }
      
      // 커스텀 헤더도 추가되어야 함
      if (result.headers['custom-header'] !== 'get-value') {
        throw new Error('GET 요청에서 커스텀 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 23: DELETE 요청에서도 헤더 보존 확인
    await (test('23. DELETE 요청에서도 헤더 보존 확인', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Custom-Header': 'delete-value'
            };
            return config;
          }
        }
      });
      
      const response = await api.test().delete('/test', {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // Authorization 헤더가 보존되어야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('DELETE 요청에서 Authorization 헤더가 보존되지 않음');
      }
      
      // 커스텀 헤더도 추가되어야 함
      if (result.headers['custom-header'] !== 'delete-value') {
        throw new Error('DELETE 요청에서 커스텀 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 24: 중첩된 interceptor 시나리오 (여러 인스턴스)
    await (test('24. 여러 API 인스턴스에서 헤더 보존', async () => {
      const api1 = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'API1-Header': 'api1-value'
            };
            return config;
          }
        }
      });
      
      const api2 = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'API2-Header': 'api2-value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response1 = await api1.test().post('/test', testData, {
        headers: { 'Original': 'original-1' }
      });
      const response2 = await api2.test().post('/test', testData, {
        headers: { 'Original': 'original-2' }
      });
      
      const result1 = response1.data;
      const result2 = response2.data;
      
      // 각 API 인스턴스의 헤더가 독립적으로 보존되어야 함
      if (result1.headers['api1-header'] !== 'api1-value' || result1.headers['original'] !== 'original-1') {
        throw new Error('API1 헤더가 보존되지 않음');
      }
      
      if (result2.headers['api2-header'] !== 'api2-value' || result2.headers['original'] !== 'original-2') {
        throw new Error('API2 헤더가 보존되지 않음');
      }
    }))();
    
    // 테스트 25: contentType과 interceptor 헤더 충돌 시나리오
    await (test('25. contentType과 interceptor 헤더 충돌 시나리오', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'application/json',
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Content-Type': 'multipart/form-data'  // 충돌 시도
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // interceptor에서 설정한 Content-Type이 우선되어야 함
      if (result.headers['content-type'] !== 'multipart/form-data') {
        throw new Error('interceptor의 Content-Type이 우선되지 않음');
      }
    }))();
    
    // 테스트 26: 대소문자 혼합 헤더 처리
    await (test('26. 대소문자 혼합 헤더 처리', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'MiXeD-CaSe': 'mixed-value',
              'lowercase': 'lower-value',
              'UPPERCASE': 'upper-value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 모든 대소문자 조합이 처리되어야 함
      if (!result.headers['mixed-case'] || !result.headers['lowercase'] || !result.headers['uppercase']) {
        throw new Error('대소문자 혼합 헤더가 처리되지 않음');
      }
    }))();
    
    // 테스트 27: 매우 긴 헤더 값 처리
    await (test('27. 매우 긴 헤더 값 처리', async () => {
      const longValue = 'a'.repeat(10000);
      
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Long-Header': longValue
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 긴 헤더 값이 보존되어야 함
      if (result.headers['long-header'] !== longValue) {
        throw new Error('긴 헤더 값이 보존되지 않음');
      }
    }))();
    
    // 테스트 28: 특수 문자를 포함한 헤더 값 처리
    await (test('28. 특수 문자를 포함한 헤더 값 처리', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Special-Header': 'value with spaces & special chars: !@#$%^&*()'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 특수 문자가 포함된 헤더 값이 보존되어야 함
      if (!result.headers['special-header'] || !result.headers['special-header'].includes('special chars')) {
        throw new Error('특수 문자를 포함한 헤더 값이 보존되지 않음');
      }
    }))();
    
    // 테스트 29: 숫자 값을 가진 헤더 처리
    await (test('29. 숫자 값을 가진 헤더 처리', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Number-Header': 12345,
              'Float-Header': 123.45
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 숫자 값이 문자열로 변환되어야 함
      if (result.headers['number-header'] !== '12345') {
        throw new Error('숫자 헤더 값이 문자열로 변환되지 않음');
      }
      
      if (result.headers['float-header'] !== '123.45') {
        throw new Error('실수 헤더 값이 문자열로 변환되지 않음');
      }
    }))();
    
    // 테스트 30: boolean 값을 가진 헤더 처리
    await (test('30. boolean 값을 가진 헤더 처리', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'True-Header': true,
              'False-Header': false
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // boolean 값이 문자열로 변환되어야 함
      if (result.headers['true-header'] !== 'true') {
        throw new Error('true 값이 문자열로 변환되지 않음');
      }
      
      if (result.headers['false-header'] !== 'false') {
        throw new Error('false 값이 문자열로 변환되지 않음');
      }
    }))();
    
    // ==========================================
    // 하위 호환성 테스트 (Backward Compatibility)
    // ==========================================
    
    // 테스트 31: 기존 코드 패턴 - Headers 없이 일반 객체만 사용
    await (test('31. 하위호환성: Headers 없이 일반 객체만 사용 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token',
          'Content-Type': 'application/json'
        }
      });
      
      const result = response.data;
      
      // 기존 방식대로 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('기존 일반 객체 헤더 패턴이 동작하지 않음');
      }
      
      if (result.headers['content-type'] !== 'application/json') {
        throw new Error('기존 Content-Type 설정이 동작하지 않음');
      }
    }))();
    
    // 테스트 32: 기존 코드 패턴 - interceptor 없이 사용
    await (test('32. interceptor 없이 사용 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // interceptor 없이도 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('interceptor 없이 사용 시 헤더가 전달되지 않음');
      }
    }))();
    
    // 테스트 33: 기존 코드 패턴 - onRequest에서 config 반환하지 않음
    await (test('33. 하위호환성: onRequest에서 config 반환하지 않음 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // config를 수정만 하고 반환하지 않는 경우도 처리해야 함
            if (config.headers instanceof Headers) {
              config.headers.set('Custom', 'value');
            }
            // return 없음 - 기존 코드에서 흔한 패턴
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // config를 반환하지 않아도 동작해야 함
      if (!result.hasBody) {
        throw new Error('config를 반환하지 않을 때 요청이 실패함');
      }
    }))();
    
    // 테스트 34: 기존 코드 패턴 - onRequest에서 아무것도 하지 않음
    await (test('34. 하위호환성: onRequest에서 아무것도 하지 않음 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // 아무것도 하지 않고 그대로 반환
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // 원본 헤더가 그대로 보존되어야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('onRequest에서 아무것도 하지 않을 때 헤더가 손실됨');
      }
    }))();
    
    // 테스트 35: 기존 코드 패턴 - tokenConfig만 사용 (onRequest 없음)
    await (test('35. 하위호환성: tokenConfig만 사용, onRequest 없음 (기존 패턴)', async () => {
      let token = 'test-token';
      
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          tokenConfig: {
            getToken: () => token,
            formatAuthHeader: (t) => ({ 'Authorization': `Bearer ${t}` })
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // tokenConfig만으로도 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer test-token') {
        throw new Error('tokenConfig만 사용 시 Authorization 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 36: 기존 코드 패턴 - Headers 직접 생성해서 사용
    await (test('36. 하위호환성: Headers 직접 생성해서 사용 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const headers = new Headers();
      headers.set('Authorization', 'Bearer token');
      headers.set('Custom', 'value');
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: headers
      });
      
      const result = response.data;
      
      // 직접 생성한 Headers가 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('직접 생성한 Headers가 동작하지 않음');
      }
      
      if (result.headers['custom'] !== 'value') {
        throw new Error('직접 생성한 Headers의 커스텀 헤더가 동작하지 않음');
      }
    }))();
    
    // 테스트 37: 기존 코드 패턴 - 배열 형태 헤더 사용
    await (test('37. 하위호환성: 배열 형태 헤더 사용 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: [
          ['Authorization', 'Bearer token'],
          ['Custom', 'value']
        ]
      });
      
      const result = response.data;
      
      // 배열 형태 헤더가 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('배열 형태 헤더가 동작하지 않음');
      }
      
      if (result.headers['custom'] !== 'value') {
        throw new Error('배열 형태 헤더의 커스텀 헤더가 동작하지 않음');
      }
    }))();
    
    // 테스트 38: 기존 코드 패턴 - onRequest에서 Headers.set() 사용 (권장 패턴)
    await (test('38. 하위호환성: onRequest에서 Headers.set() 사용 (권장 패턴)', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // 기존 권장 패턴
            if (config.headers instanceof Headers) {
              config.headers.set('Custom', 'value');
            } else {
              config.headers = {
                ...config.headers,
                'Custom': 'value'
              };
            }
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // 기존 권장 패턴이 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('기존 권장 패턴에서 원본 헤더가 손실됨');
      }
      
      if (result.headers['custom'] !== 'value') {
        throw new Error('기존 권장 패턴에서 커스텀 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 39: 기존 코드 패턴 - config 객체 직접 수정
    await (test('39. 하위호환성: config 객체 직접 수정 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // config를 직접 수정하는 기존 패턴
            config.timeout = 5000;
            config.headers = {
              ...config.headers,
              'Custom': 'value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // config 직접 수정 패턴이 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('config 직접 수정 패턴에서 원본 헤더가 손실됨');
      }
      
      if (result.headers['custom'] !== 'value') {
        throw new Error('config 직접 수정 패턴에서 커스텀 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 40: 기존 코드 패턴 - 여러 interceptor 체이닝 (시뮬레이션)
    await (test('40. 하위호환성: 여러 헤더 수정이 순차적으로 적용되는지', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            // 첫 번째 수정
            config.headers = {
              ...config.headers,
              'Header-1': 'value-1'
            };
            
            // 두 번째 수정 (같은 함수 내에서)
            config.headers = {
              ...config.headers,
              'Header-2': 'value-2'
            };
            
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Original': 'original-value'
        }
      });
      
      const result = response.data;
      
      // 모든 헤더가 순차적으로 적용되어야 함
      if (result.headers['original'] !== 'original-value') {
        throw new Error('원본 헤더가 손실됨');
      }
      
      if (result.headers['header-1'] !== 'value-1') {
        throw new Error('첫 번째 헤더가 적용되지 않음');
      }
      
      if (result.headers['header-2'] !== 'value-2') {
        throw new Error('두 번째 헤더가 적용되지 않음');
      }
    }))();
    
    // 테스트 41: 기존 코드 패턴 - GET 요청에 body 없이 헤더만
    await (test('41. 하위호환성: GET 요청에 헤더만 사용 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Custom': 'value'
            };
            return config;
          }
        }
      });
      
      const response = await api.test().get('/test', {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // GET 요청에서도 헤더가 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('GET 요청에서 원본 헤더가 손실됨');
      }
      
      if (result.headers['custom'] !== 'value') {
        throw new Error('GET 요청에서 커스텀 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 42: 기존 코드 패턴 - contentType 설정과 헤더 혼합
    await (test('42. 하위호환성: contentType 설정과 헤더 혼합 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      }, {
        contentType: 'application/json',
        interceptor: {
          onRequest: (config) => {
            config.headers = {
              ...config.headers,
              'Custom': 'value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // contentType과 헤더가 함께 정상 동작해야 함
      if (result.headers['content-type'] !== 'application/json') {
        throw new Error('contentType 설정이 적용되지 않음');
      }
      
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('원본 헤더가 손실됨');
      }
      
      if (result.headers['custom'] !== 'value') {
        throw new Error('커스텀 헤더가 추가되지 않음');
      }
    }))();
    
    // 테스트 43: 기존 코드 패턴 - 빈 헤더 객체
    await (test('43. 하위호환성: 빈 헤더 객체 사용 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {}
      });
      
      const result = response.data;
      
      // 빈 헤더 객체도 정상 처리되어야 함
      if (!result.hasBody) {
        throw new Error('빈 헤더 객체 사용 시 요청이 실패함');
      }
    }))();
    
    // 테스트 44: 기존 코드 패턴 - 헤더 없이 요청
    await (test('44. 하위호환성: 헤더 없이 요청 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData);
      
      const result = response.data;
      
      // 헤더 없이도 정상 동작해야 함
      if (!result.hasBody) {
        throw new Error('헤더 없이 요청 시 실패함');
      }
    }))();
    
    // 테스트 45: 기존 코드 패턴 - onRequest에서 async 함수 사용
    await (test('45. 하위호환성: onRequest에서 async 함수 사용 (기존 패턴)', async () => {
      const api = handler({
        test: serverUrl
      }, {
        interceptor: {
          onRequest: async (config) => {
            // 비동기 작업 시뮬레이션
            await new Promise(resolve => setTimeout(resolve, 10));
            config.headers = {
              ...config.headers,
              'Async-Header': 'async-value'
            };
            return config;
          }
        }
      });
      
      const testData = { name: 'Test' };
      const response = await api.test().post('/test', testData, {
        headers: {
          'Authorization': 'Bearer token'
        }
      });
      
      const result = response.data;
      
      // async onRequest도 정상 동작해야 함
      if (result.headers['authorization'] !== 'Bearer token') {
        throw new Error('async onRequest에서 원본 헤더가 손실됨');
      }
      
      if (result.headers['async-header'] !== 'async-value') {
        throw new Error('async onRequest에서 커스텀 헤더가 추가되지 않음');
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
