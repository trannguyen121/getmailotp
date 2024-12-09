const express = require('express');
const createMailbox = require('../src/createMail.js'); // Hàm tạo mailbox
const getOtpsForAllEmails = require('../src/getotp.js'); // Hàm lấy OTP
const fs = require('fs');
const path = require('path');

const app = express();

// Hàm kiểm tra và lưu email vào file mail_results.txt
function saveToMailResults(email, password) {
    const allEmails = readMailResults(); // Đọc danh sách email hiện có
    const isDuplicate = allEmails.some(entry => entry.email === email); // Kiểm tra email trùng lặp
    if (!isDuplicate) {
        fs.appendFileSync(emailFilePath, `${email},${password}\n`, 'utf-8');
        console.log(`Đã lưu email mới: ${email}`);
    } else {
        console.log(`Email đã tồn tại, không lưu lại: ${email}`);
    }
}
const port = process.env.PORT || 3000;

// Đường dẫn file mail_results.txt và otp_results.txt
const emailFilePath = path.join(__dirname, '../src/mail_results.txt');
const otpFilePath = path.join(__dirname, '../src/otp_results.txt');

// Tạo tệp nếu chưa tồn tại
[emailFilePath, otpFilePath].forEach((filePath) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf-8');
  }
});

// Middleware xử lý JSON và URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Hàm đọc danh sách email đã tạo
function readMailResults() {
  if (!fs.existsSync(emailFilePath)) {
    console.warn(`File không tồn tại: ${emailFilePath}`);
    return [];
  }

  try {
    const data = fs.readFileSync(emailFilePath, 'utf-8');
    const seenEmails = new Set();

    return data
      .trim()
      .split('\n')
      .map((line, index) => {
        const parts = line.split(',');

        // Kiểm tra định dạng dòng
        if (parts.length !== 2) {
          console.warn(`Dòng không hợp lệ (dòng ${index + 1}): "${line}"`);
          return null; // Bỏ qua dòng không hợp lệ
        }

        const email = parts[0]?.trim();
        const password = parts[1]?.trim();

        // Kiểm tra giá trị rỗng
        if (!email || !password) {
          console.warn(`Thiếu email hoặc password (dòng ${index + 1}): "${line}"`);
          return null; // Bỏ qua dòng không hợp lệ
        }

        return { email, password };
      })
      .filter(Boolean) // Loại bỏ các dòng null (không hợp lệ)
      .filter((entry) => {
        if (seenEmails.has(entry.email)) {
          console.warn(`Email trùng lặp: ${entry.email}`);
          return false; // Loại bỏ email trùng lặp
        }
        seenEmails.add(entry.email);
        return true;
      });

  } catch (error) {
    console.error(`Lỗi khi đọc file: ${error.message}`);
    return [];
  }
}


// Hàm đọc danh sách OTP
function readOtpResults() {
  if (!fs.existsSync(otpFilePath)) {
    console.warn(`File không tồn tại: ${otpFilePath}`);
    return {};
  }

  try {
    const data = fs.readFileSync(otpFilePath, 'utf-8');
    const otpMap = {};

    data
      .trim()
      .split('\n')
      .forEach((line, index) => {
        const cleanedLine = line.replace('Email: ', '').trim();
        const parts = cleanedLine.split(', OTP: ');

        // Kiểm tra định dạng dòng
        if (parts.length !== 2) {
          console.warn(`Dòng không hợp lệ (dòng ${index + 1}): "${line}"`);
          return; // Bỏ qua dòng không hợp lệ
        }

        const email = parts[0]?.trim();
        const otp = parts[1]?.trim();

        // Kiểm tra giá trị rỗng
        if (!email || !otp) {
          console.warn(`Thiếu email hoặc OTP (dòng ${index + 1}): "${line}"`);
          return; // Bỏ qua dòng không hợp lệ
        }

        otpMap[email] = otp; // Lưu vào bản đồ OTP
      });

    return otpMap;
  } catch (error) {
    console.error(`Lỗi khi đọc file: ${error.message}`);
    return {};
  }
}


// Giao diện chính
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
        <title>Tạo Mailbox và Lấy OTP</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css" rel="stylesheet">
        <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
      </head>
      <body class="container mt-5">
        <h2 class="mb-4">Tạo Mailbox</h2>
        <form id="create-mailbox-form" method="post">
          <div class="mb-3">
            <label for="numberOfMails" class="form-label">Số lượng email muốn tạo:</label>
            <input type="number" id="numberOfMails" name="numberOfMails" class="form-control" required>
          </div>
          <button type="submit" class="btn btn-primary">Tạo Mailbox</button>
        </form>
        <button id="fetch-otp-btn" class="btn btn-success mt-3">Lấy OTP từ Mailbox</button>
        <button id="delete-mails-btn" class="btn btn-danger mt-3">Xóa Email đã chọn</button>
        <h3 class="mt-5">Danh sách email đã tạo:</h3>
        <ul id="email-list" class="list-group">
          ${emailListHtml}
        </ul>
        
        <script>
          // Tạo mailbox
          $('#create-mailbox-form').on('submit', function (e) {
            e.preventDefault();
            const numberOfMails = $('#numberOfMails').val();
            $.post('/create-mails', { numberOfMails }, function (response) {
              if (response.success) {
                location.reload(); // Làm mới trang để cập nhật danh sách email
              } else {
                alert(response.message || 'Có lỗi xảy ra.');
              }
            }).fail(() => {
              alert('Không thể tạo mailbox. Vui lòng thử lại.');
            });
          });

          // Lấy OTP
          $('#fetch-otp-btn').on('click', function () {
            const selectedEmails = $('.email-checkbox:checked')
              .map(function () {
                return $(this).data('email');
              })
              .get();

            if (selectedEmails.length === 0) {
              alert('Vui lòng chọn ít nhất một email để lấy OTP.');
              return;
            }

            $.get('/get-otp-ajax', { emails: selectedEmails }, function (response) {
              if (response.success) {
                location.reload(); // Làm mới trang để cập nhật danh sách OTP
              } else {
                alert(response.message || 'Không thể lấy OTP. Vui lòng thử lại.');
              }
            }).fail(() => {
              alert('Không thể lấy OTP. Vui lòng thử lại.');
            });
          });

          // Xóa email đã chọn
          $('#delete-mails-btn').on('click', function () {
            const selectedEmails = $('.email-checkbox:checked')
              .map(function () {
                return $(this).data('email');
              })
              .get();

            if (selectedEmails.length === 0) {
              alert('Vui lòng chọn ít nhất một email để xóa.');
              return;
            }

            $.post('/delete-mails', { emails: selectedEmails }, function (response) {
              if (response.success) {
                location.reload(); // Làm mới trang để cập nhật danh sách email
              } else {
                alert(response.message || 'Không thể xóa email. Vui lòng thử lại.');
              }
            }).fail(() => {
              alert('Không thể xóa email. Vui lòng thử lại.');
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

// Endpoint tạo mailbox
app.post('/create-mails', async (req, res) => {
  try {
    const numberOfMails = parseInt(req.body.numberOfMails);
    if (isNaN(numberOfMails) || numberOfMails <= 0) {
      return res.status(400).json({ success: false, message: 'Số lượng email phải là số dương.' });
    }

    const domain = 'myngyemail.com';
    const results = [];
    const existingEmails = readMailResults().map((entry) => entry.email); // Lấy danh sách email hiện tại

    for (let i = 0; i < numberOfMails; i++) {
      const result = await createMailbox(domain);
      if (result.success && !existingEmails.includes(result.email)) { // Chỉ thêm email nếu chưa tồn tại
saveToMailResults(result.email, result.password);
        results.push(result);
      }
    }

    // Loại bỏ các dòng trùng lặp sau khi thêm email mới
    removeDuplicateLines(emailFilePath);

    res.json({ success: true, emails: results });
  } catch (error) {
    console.error('Lỗi khi tạo mailbox:', error.message);
    res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi tạo mailbox.' });
  }
});

// Endpoint lấy OTP
app.get('/get-otp-ajax', async (req, res) => {
  try {
    const selectedEmails = req.query.emails || []; // Lấy danh sách email được chọn từ query
    if (!Array.isArray(selectedEmails) || selectedEmails.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một email để lấy OTP.' });
    }

    // Gọi hàm lấy OTP với danh sách email được chọn
    await getOtpsForAllEmails(emailFilePath, selectedEmails);

    // Đọc danh sách email và OTP cập nhật
    const emails = readMailResults();
    const otps = readOtpResults();
    const results = emails.map((email) => ({
      email: email.email,
      password: email.password,
      otp: otps[email.email] || null,
    }));

    res.json({ success: true, emails: results });
  } catch (error) {
    console.error('Lỗi khi lấy OTP:', error.message);
    res.status(500).json({ success: false, message: 'Không thể lấy OTP. Vui lòng thử lại.' });
  }
});


// Endpoint xóa email
app.post('/delete-mails', (req, res) => {
  try {
    const emailsToDelete = req.body.emails || [];
    if (!Array.isArray(emailsToDelete) || emailsToDelete.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có email nào được chọn để xóa.' });
    }

    const allEmails = readMailResults();
    const updatedEmails = allEmails.filter((entry) => !emailsToDelete.includes(entry.email));

    fs.writeFileSync(
      emailFilePath,
      updatedEmails.map((entry) => `${entry.email},${entry.password}`).join('\n')
    );

    if (fs.existsSync(otpFilePath)) {
      const otpData = readOtpResults();
      emailsToDelete.forEach((email) => {
        delete otpData[email];
      });

      fs.writeFileSync(
        otpFilePath,
        Object.entries(otpData)
          .map(([email, otp]) => `Email: ${email}, OTP: ${otp}`)
          .join('\n')
      );
    }

    res.json({ success: true, message: 'Đã xóa email thành công.' });
  } catch (error) {
    console.error('Lỗi khi xóa email:', error.message);
    res.status(500).json({ success: false, message: 'Không thể xóa email. Vui lòng thử lại.' });
  }
});

function removeDuplicateLines(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  const data = fs.readFileSync(filePath, 'utf-8');
  const uniqueLines = Array.from(new Set(data.trim().split('\n')));
  
  fs.writeFileSync(filePath, uniqueLines.join('\n'), 'utf-8');
  console.log(`Đã loại bỏ các dòng trùng lặp trong file: ${filePath}`);
}

removeDuplicateLines(emailFilePath);


// Chạy server
app.listen(port, () => {
  console.log(`Ứng dụng đang chạy tại http://localhost:${port}`);
});
