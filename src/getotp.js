const Imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Đường dẫn file lưu kết quả OTP
const logFilePath = path.join(__dirname, '../src/otp_results.txt');
const noOtpLogFile = path.join(__dirname, '../src/no_otp_emails.log');

// Hàm để đọc các email và mật khẩu từ file
async function readEmailsFromFile(filePath) {
  const emails = [];
  try {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const [email, password] = line.split(',');
      if (email && password) {
        emails.push({ email, password: password.trim() });
      }
    }

    if (emails.length === 0) {
      console.warn('File email trống hoặc không hợp lệ.');
    }
  } catch (err) {
    console.error('Lỗi khi đọc file email:', err.message);
  }
  return emails;
}

// Hàm để ghi log email không có OTP
function logNoOtpEmail(email, sender, subject) {
  try {
    const content = `Email: ${email}, From: ${sender}, Subject: ${subject}\n`;
    fs.appendFileSync(noOtpLogFile, content, 'utf8');
    console.log(`Đã ghi log email không có OTP: ${email}`);
  } catch (err) {
    console.error('Lỗi khi ghi log email không có OTP:', err.message);
  }
}

// Hàm để ghi nội dung email ra console và tìm mã OTP
function logAndExtractOtp(email, sender, subject, plainText, htmlContent) {
  console.log('========================================');
  console.log(`Người nhận: ${email}`);
  console.log(`Người gửi: ${sender}`);
  console.log(`Tiêu đề: ${subject}`);
  console.log('Nội dung email (Plain Text):\n');
  console.log(plainText.trim());
  console.log('\n========================================');

  // Tìm mã OTP trong nội dung
  let otpMatch = plainText.match(/\b\d{5,6}\b/);
  if (!otpMatch) {
    otpMatch = htmlContent.match(/\b\d{5,6}\b/); // Dự phòng tìm trong HTML
  }

  if (otpMatch) {
    console.log(`Mã OTP được tìm thấy: ${otpMatch[0]}`);
    return otpMatch[0];
  } else {
    console.log('Không tìm thấy mã OTP trong email.');
    logNoOtpEmail(email, sender, subject);
    return null;
  }
}

// Hàm để ghi OTP ra file
function saveOtpToFile(email, otp) {
  const existingOtps = new Map(
      fs.readFileSync(otpFilePath, 'utf8').trim().split('\n').map(line => {
          const [savedEmail, savedOtp] = line.replace('Email: ', '').split(', OTP: ');
          return [savedEmail.trim(), savedOtp.trim()];
      })
  );

  if (!existingOtps.has(email)) {
      fs.appendFileSync(otpFilePath, `Email: ${email}, OTP: ${otp}\n`, 'utf8');
      console.log(`Đã lưu OTP cho ${email}: ${otp}`);
  } else {
      console.log(`OTP cho ${email} đã tồn tại, bỏ qua.`);
  }
}


// Hàm để lấy OTP từ email
async function getOtpFromMail(email, password) {
  const config = {
    imap: {
      user: email,
      password: password,
      host: 'mail.myngyemail.com',
      port: 993,
      tls: true,
      authTimeout: 5000,
    },
  };

  try {
    const connection = await Imap.connect(config);
    await connection.openBox('INBOX');

    // Tìm email chưa đọc
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: ['HEADER', 'TEXT', 'HTML'], struct: true };
    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      console.log(`Không tìm thấy email mới cho ${email}`);
      connection.end();
      return;
    }

    console.log(`Tìm thấy ${messages.length} email chưa đọc cho ${email}`);

    for (const item of messages) {
      const all = Imap.getParts(item.attributes.struct);
      for (const part of all) {
        if (!part.disposition || part.disposition === 'inline') {
          const raw = await connection.getPartData(item, part);
          const parsed = await simpleParser(raw);

          const sender = parsed.headers.get('from') || 'Không có người gửi';
          const subject = parsed.headers.get('subject') || 'Không có tiêu đề';
          const plainText = parsed.text || '';
          const htmlContent = parsed.html || '';

          // Log toàn bộ nội dung email
          const otp = logAndExtractOtp(email, sender, subject, plainText, htmlContent);

          if (otp) {
            saveOtpToFile(email, otp);

            // Đánh dấu email đã đọc
            await connection.addFlags(item.attributes.uid, '\\Seen');

            connection.end();
            return; // Dừng ngay khi tìm thấy OTP
          }
        }
      }
    }

    console.log(`Không tìm thấy OTP trong email từ ${email}`);
    connection.end();
  } catch (err) {
    console.error(`Lỗi khi kết nối hoặc lấy email cho ${email}:`, err.message);
  }
}

// Hàm để lấy OTP cho tất cả các email từ file
// Hàm để lấy OTP cho các email được chọn
async function getOtpsForAllEmails(filePath, selectedEmails) {
  try {
    const allEmails = await readEmailsFromFile(filePath);

    // Lọc email theo danh sách được chọn
    const emailsToProcess = allEmails.filter(entry => selectedEmails.includes(entry.email));
    if (emailsToProcess.length === 0) {
      console.warn('Không có email nào khớp với danh sách được chọn.');
      return;
    }

    for (const { email, password } of emailsToProcess) {
      console.log(`Đang xử lý email: ${email}`);
      await getOtpFromMail(email, password);
    }

    console.log('Hoàn thành việc lấy OTP cho các email được chọn.');
  } catch (err) {
    console.error('Lỗi khi xử lý lấy OTP:', err.message);
  }
}


// Export hàm chính để sử dụng trong main.js
module.exports = getOtpsForAllEmails;
