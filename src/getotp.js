const Imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Đường dẫn file log
const logFilePath = path.join(__dirname, '../src/otp_results.txt');
const noOtpLogFile = path.join(__dirname, '../src/no_otp_emails.log');

// Hàm đọc email và mật khẩu từ file
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
        emails.push({ email: email.trim(), password: password.trim() });
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

// Ghi log email không có OTP
function logNoOtpEmail(email, sender, subject) {
  try {
    const content = `Email: ${email}, From: ${sender}, Subject: ${subject}\n`;
    fs.appendFileSync(noOtpLogFile, content, 'utf8');
    console.log(`Đã ghi log email không có OTP: ${email}`);
  } catch (err) {
    console.error('Lỗi khi ghi log email không có OTP:', err.message);
  }
}

// Ghi OTP vào file
function saveOtpToFile(email, otp) {
  try {
    const content = `Email: ${email}, OTP: ${otp}\n`;
    fs.appendFileSync(logFilePath, content, 'utf8');
    console.log(`Đã lưu OTP cho ${email}: ${otp}`);
  } catch (err) {
    console.error('Lỗi khi lưu OTP:', err.message);
  }
}

// Hàm phân tích OTP từ nội dung email
function extractOtpFromEmail(email, sender, subject, plainText, htmlContent) {
  console.log('========================================');
  console.log(`Người nhận: ${email}`);
  console.log(`Người gửi: ${sender}`);
  console.log(`Tiêu đề: ${subject}`);
  console.log('Nội dung email:\n', plainText.trim());
  console.log('========================================');

  // Tìm OTP
  let otpMatch = plainText.match(/\b\d{5,6}\b/);
  if (!otpMatch) {
    otpMatch = htmlContent.match(/\b\d{5,6}\b/);
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

// Hàm lấy OTP từ email
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

    // Lấy các email chưa đọc
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'], struct: true };
    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      console.log(`Không tìm thấy email mới cho ${email}`);
      connection.end();
      return;
    }

    console.log(`Tìm thấy ${messages.length} email chưa đọc cho ${email}`);

    for (const item of messages) {
      try {
        const allParts = Imap.getParts(item.attributes.struct);
        for (const part of allParts) {
          if (!part.disposition || part.disposition === 'inline') {
            const raw = await connection.getPartData(item, part);

            // Parse email
            const parsed = await simpleParser(raw);
            const sender = parsed.headers.get('from') || 'Không có người gửi';
            const subject = parsed.headers.get('subject') || 'Không có tiêu đề';
            const plainText = parsed.text || '';
            const htmlContent = parsed.html || '';

            // Tìm OTP
            const otp = extractOtpFromEmail(email, sender, subject, plainText, htmlContent);

            if (otp) {
              saveOtpToFile(email, otp);

              // Đánh dấu email là đã đọc
              await connection.addFlags(item.attributes.uid, '\\Seen');
              connection.end();
              return; // Kết thúc nếu tìm thấy OTP
            }
          }
        }
      } catch (innerErr) {
        console.error(`Lỗi khi xử lý phần body của email ${email}: ${innerErr.message}`);
        continue; // Bỏ qua email lỗi và tiếp tục với email khác
      }
    }

    console.log(`Không tìm thấy OTP trong email từ ${email}`);
    connection.end();
  } catch (err) {
    console.error(`Lỗi khi xử lý email ${email}: ${err.message}`);
  }
}
// Lấy OTP cho tất cả email từ file
async function getOtpsForEmails(filePath) {
  try {
    const emails = await readEmailsFromFile(filePath);

    for (const { email, password } of emails) {
      console.log(`Đang xử lý email: ${email}`);
      await getOtpFromMail(email, password);
    }

    console.log('Hoàn thành việc lấy OTP cho tất cả email.');
  } catch (err) {
    console.error('Lỗi khi lấy OTP cho các email:', err.message);
  }
}

module.exports = getOtpsForEmails;
