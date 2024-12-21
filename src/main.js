const express = require('express');
const createMailbox = require('../src/createMail.js'); // Hàm tạo mailbox
const getOtpsForAllEmails = require('../src/getotp.js'); // Hàm lấy OTP
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Đường dẫn file
const emailFilePath = path.join(__dirname, '../src/mail_results.txt');
const otpFilePath = path.join(__dirname, '../src/otp_results.txt');

// Đảm bảo các file cần thiết tồn tại
[emailFilePath, otpFilePath].forEach((filePath) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf-8');
  }
});

// Middleware xử lý JSON và URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Hàm lưu email vào file, loại bỏ dòng trùng lặp tự động
function saveToMailResults(email, password) {
  const allEmails = readMailResults();
  const isDuplicate = allEmails.some((entry) => entry.email === email);

  if (!isDuplicate) {
    fs.appendFileSync(emailFilePath, `${email},${password}\n`, 'utf-8');
    console.log(`Đã lưu email mới: ${email}`);
  } else {
    console.log(`Email đã tồn tại, không lưu lại: ${email}`);
  }
}

// Hàm đọc danh sách email từ file
function readMailResults() {
  if (!fs.existsSync(emailFilePath)) return [];
  try {
    const data = fs.readFileSync(emailFilePath, 'utf-8').trim();
    const seenEmails = new Set();

    return data
      .split('\n')
      .map((line) => {
        const [email, password] = line.split(',');
        if (!email || !password || seenEmails.has(email)) return null;

        seenEmails.add(email);
        return { email: email.trim(), password: password.trim() };
      })
      .filter(Boolean);
  } catch (error) {
    console.error(`Lỗi khi đọc email từ file: ${error.message}`);
    return [];
  }
}

// Hàm đọc OTP từ file
function readOtpResults() {
  if (!fs.existsSync(otpFilePath)) return {};
  try {
    const data = fs.readFileSync(otpFilePath, 'utf-8').trim();
    const otpMap = {};

    data.split('\n').forEach((line) => {
      const [email, otp] = line.replace('Email: ', '').split(', OTP: ');
      if (email && otp) otpMap[email.trim()] = otp.trim();
    });

    return otpMap;
  } catch (error) {
    console.error(`Lỗi khi đọc OTP từ file: ${error.message}`);
    return {};
  }
}

// Endpoint hiển thị giao diện chính
app.get('/', (req, res) => {
  const emails = readMailResults();
  const otps = readOtpResults();

  const emailListHtml = emails.length
    ? `
      <li class="list-group-item">
        <input type="checkbox" id="select-all-checkbox">
        <label for="select-all-checkbox" class="ms-2 fw-bold">Chọn tất cả</label>
      </li>
      ${emails
        .map(
          (entry, index) => `
          <li class="list-group-item d-flex justify-content-between align-items-start">
            <div class="ms-2">
              <input type="checkbox" class="email-checkbox" data-email="${entry.email}" id="email-${index}">
              <label for="email-${index}">${entry.email} - Password: ${entry.password}</label>
            </div>
            <span class="badge bg-${otps[entry.email] ? 'success' : 'secondary'}">
              ${otps[entry.email] || 'Chưa có OTP'}
            </span>
          </li>`
        )
        .join('')}`
    : '<li class="list-group-item">Chưa có email nào được tạo.</li>';

  res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mailbox Manager</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css" rel="stylesheet">
      <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    </head>
          <header class="mt-5 text-center">
        <p>Theo dõi tại fb: 
          <a href="https://www.facebook.com/dnguyen2077" target="_blank">
            Trần Nguyễn Đại Nguyên
          </a>
        </p>
      </header>
    <body class="container mt-5">
      <h2 class="mb-4">Quản lý Mailbox</h2>
      <form id="create-mailbox-form">
        <div class="mb-3">
          <label for="numberOfMails" class="form-label">Số lượng email muốn tạo:</label>
          <input type="number" id="numberOfMails" name="numberOfMails" class="form-control" min="1" required>
        </div>
        <button type="submit" class="btn btn-primary">Tạo Mailbox</button>
      </form>
      <button id="fetch-otp-btn" class="btn btn-success mt-3">Lấy OTP</button>
      <button id="delete-mails-btn" class="btn btn-danger mt-3">Xóa Email đã chọn</button>
      <h3 class="mt-5">Danh sách email đã tạo:</h3>
      <ul class="list-group">${emailListHtml}</ul>

      <!-- Footer với liên kết Facebook -->


      <script>
        $('#create-mailbox-form').on('submit', function (e) {
          e.preventDefault();
          const count = $('#numberOfMails').val();
          $.post('/create-mails', { numberOfMails: count }, function (data) {
            if (data.success) location.reload();
            else alert(data.message || 'Có lỗi xảy ra.');
          });
        });

        $('#fetch-otp-btn').on('click', function () {
          const selectedEmails = $('.email-checkbox:checked').map(function () {
            return $(this).data('email');
          }).get();
          if (selectedEmails.length === 0) return alert('Vui lòng chọn email.');

          $.get('/get-otp-ajax', { emails: selectedEmails }, function (data) {
            if (data.success) location.reload();
            else alert(data.message || 'Không thể lấy OTP.');
          });
        });

        $('#delete-mails-btn').on('click', function () {
          const selectedEmails = $('.email-checkbox:checked').map(function () {
            return $(this).data('email');
          }).get();
          if (selectedEmails.length === 0) return alert('Vui lòng chọn email để xóa.');

          $.post('/delete-mails', { emails: selectedEmails }, function (data) {
            if (data.success) location.reload();
            else alert(data.message || 'Không thể xóa email.');
          });
        });

        // Chọn tất cả email
        $(document).on('change', '#select-all-checkbox', function () {
          const isChecked = $(this).is(':checked');
          $('.email-checkbox').prop('checked', isChecked);
        });
      </script>
    </body>
    </html>`);
});


// Endpoint tạo email
app.post('/create-mails', async (req, res) => {
  const count = parseInt(req.body.numberOfMails);
  if (!count || count <= 0) return res.status(400).json({ success: false, message: 'Số lượng email không hợp lệ.' });

  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await createMailbox('myngyemail.com');
    if (result.success) {
      saveToMailResults(result.email, result.password);
      results.push(result);
    }
  }

  res.json({ success: true, emails: results });
});

// Endpoint lấy OTP
app.get('/get-otp-ajax', async (req, res) => {
  const emails = req.query.emails || [];
  if (!emails.length) return res.status(400).json({ success: false, message: 'Không có email nào được chọn.' });

  await getOtpsForAllEmails(emailFilePath, emails);
  res.json({ success: true });
});

// Endpoint xóa email
app.post('/delete-mails', (req, res) => {
  const emailsToDelete = req.body.emails || [];
  const allEmails = readMailResults();
  const remainingEmails = allEmails.filter((entry) => !emailsToDelete.includes(entry.email));

  fs.writeFileSync(emailFilePath, remainingEmails.map((entry) => `${entry.email},${entry.password}`).join('\n'), 'utf-8');
  res.json({ success: true });
});

// Chạy server
app.listen(port, () => console.log(`Server đang chạy tại http://localhost:${port}`));
