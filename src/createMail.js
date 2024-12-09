require('dotenv').config(); // Sử dụng dotenv để bảo mật API Key
const axios = require('axios');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');

// Cấu hình thông tin Mailcow API (từ .env để bảo mật)
const MAILCOW_API_URL = process.env.MAILCOW_API_URL || "https://mail.myngyemail.com/api/v1/add/mailbox";
const MAILCOW_API_KEY = process.env.MAILCOW_API_KEY || "76457B-4124F7-8B60B4-EA0651-61EE0C"; // Thay bằng giá trị thật hoặc sử dụng từ .env

// Function để random user và password
function generateRandomUserAndPass() {
  const localPart = faker.internet.userName().toLowerCase(); // Random tên người dùng
  const password = faker.internet.password(12); // Random mật khẩu dài 12 ký tự
  return { localPart, password };
}

// Hàm để ghi email và mật khẩu vào file
function saveToResultsFile(email, password) {
  const filePath = path.join(__dirname, './mail_results.txt'); // Đường dẫn file mail_results.txt
  const data = `${email},${password}\n`;
  try {
    fs.appendFileSync(filePath, data, 'utf8'); // Ghi thêm dòng mới vào file
    console.log(`Đã lưu email: ${email}`);
  } catch (error) {
    console.error(`Lỗi khi ghi vào file: ${filePath}`, error.message);
  }
}

// Function để tạo mailbox
async function createMailbox(domain) {
  const { localPart, password } = generateRandomUserAndPass();

  const headers = {
    'X-API-Key': MAILCOW_API_KEY,
    'Content-Type': 'application/json'
  };

  const data = {
    "local_part": localPart,
    "domain": domain,
    "name": localPart,
    "quota": 1024, // Quota mailbox (MB)
    "password": password,
    "password2": password,
    "active": "1",
    "tls_enforce_in": "1",
    "tls_enforce_out": "1"
  };

  try {
    const response = await axios.post(MAILCOW_API_URL, data, { headers });

    if (response.status === 200 && response.data[0]?.type === 'success') {
      const email = `${localPart}@${domain}`;
      console.log(`Tạo mailbox thành công: ${email}`);
      
      // Ghi thông tin vào file
      saveToResultsFile(email, password);

      return { success: true, email, password };
    } else {
      const errorMsg = response.data[0]?.msg || 'Không rõ lỗi.';
      console.error(`Lỗi khi tạo mailbox: ${errorMsg}`);
      return { success: false, message: errorMsg };
    }
  } catch (error) {
    console.error('Lỗi khi gọi API Mailcow:', error.message);
    return { success: false, message: error.message };
  }
}

module.exports = createMailbox;
