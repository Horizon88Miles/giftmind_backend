const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function testAuthFlow() {
  console.log('=== 开始完整认证链路测试 ===\n');
  
  try {
    // 1. 登录获取 token
    console.log('1. 登录获取 token...');
    const loginResult = await execAsync(`curl -s -X POST http://localhost:3000/auth/loginSms \\
      -H "Content-Type: application/json" \\
      -d '{"phone": "18988889999", "code": "123456"}'`);
    
    const loginData = JSON.parse(loginResult.stdout);
    
    if (loginData.code !== 0) {
      console.error('❌ 登录失败:', loginData);
      return;
    }
    
    console.log('✅ 登录成功!');
    let accessToken = loginData.data.accessToken;
    const refreshToken = loginData.data.refreshToken;
    console.log('AccessToken:', accessToken.substring(0, 50) + '...');
    console.log('RefreshToken:', refreshToken.substring(0, 50) + '...\n');
    
    // 2. 测试 /auth/me 接口
    console.log('2. 测试 /auth/me 接口...');
    const meResult = await execAsync(`curl -s -X GET http://localhost:3000/auth/me \\
      -H "Authorization: Bearer ${accessToken}"`);
    
    const meData = JSON.parse(meResult.stdout);
    console.log('/auth/me 结果:', meData);
    
    if (meData.code === 0) {
      console.log('✅ /auth/me 接口正常!');
      console.log('用户信息:', meData.data);
    } else {
      console.log('❌ /auth/me 接口失败:', meData);
    }
    console.log();
    
    // 3. 测试刷新令牌
    console.log('3. 测试刷新令牌...');
    const refreshResult = await execAsync(`curl -s -X POST http://localhost:3000/auth/refresh \\
      -H "Content-Type: application/json" \\
      -d '{"refreshToken": "${refreshToken}"}'`);
    
    const refreshData = JSON.parse(refreshResult.stdout);
    console.log('刷新令牌结果:', refreshData);
    
    if (refreshData.code === 0) {
      console.log('✅ 刷新令牌成功!');
      accessToken = refreshData.data.accessToken; // 更新 access token
      console.log('新的 AccessToken:', accessToken.substring(0, 50) + '...');
    } else {
      console.log('❌ 刷新令牌失败:', refreshData);
      return;
    }
    console.log();
    
    // 4. 用新的 access token 再次测试 /auth/me
    console.log('4. 用新 token 测试 /auth/me...');
    const meResult2 = await execAsync(`curl -s -X GET http://localhost:3000/auth/me \\
      -H "Authorization: Bearer ${accessToken}"`);
    
    const meData2 = JSON.parse(meResult2.stdout);
    console.log('/auth/me 结果 (新token):', meData2);
    
    if (meData2.code === 0) {
      console.log('✅ 新 token 验证成功!');
    } else {
      console.log('❌ 新 token 验证失败:', meData2);
    }
    console.log();
    
    // 5. 测试登出
    console.log('5. 测试登出...');
    const logoutResult = await execAsync(`curl -s -X POST http://localhost:3000/auth/logout \\
      -H "Authorization: Bearer ${accessToken}" \\
      -H "Content-Type: application/json" \\
      -d '{"refreshToken": "${refreshToken}"}'`);
    
    const logoutData = JSON.parse(logoutResult.stdout);
    console.log('登出结果:', logoutData);
    
    if (logoutData.code === 0) {
      console.log('✅ 登出成功!');
    } else {
      console.log('❌ 登出失败:', logoutData);
    }
    console.log();
    
    // 6. 验证登出后 token 是否失效
    console.log('6. 验证登出后 token 是否失效...');
    const meResult3 = await execAsync(`curl -s -X GET http://localhost:3000/auth/me \\
      -H "Authorization: Bearer ${accessToken}"`);
    
    const meData3 = JSON.parse(meResult3.stdout);
    console.log('登出后 /auth/me 结果:', meData3);
    
    if (meData3.code !== 0) {
      console.log('✅ Token 已正确失效!');
    } else {
      console.log('❌ Token 未失效，可能存在安全问题!');
    }
    
    console.log('\n=== 认证链路测试完成 ===');
    
  } catch (error) {
    console.error('测试过程中出现错误:', error.message);
  }
}

testAuthFlow();
