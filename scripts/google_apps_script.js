/**
 * =========================================================================================
 * 🌟 CẦU NỐI GOOGLE APPS SCRIPT - LỚP HỌC HẠNH PHÚC V4.1 (1 THƯ MỤC DÙNG CHUNG TOÀN TRƯỜNG)
 * Tác giả: Thầy giáo Nguyễn Thanh Liêm
 * =========================================================================================
 *
 * 📖 CÁCH HOẠT ĐỘNG
 * - Tất cả tài khoản (GVCN, GVBM, Quản trị nhà trường, BGH) dùng chung 1 thư mục Google Drive.
 * - Mỗi lớp lưu 1 tệp riêng: gvcn_{ten_lop}.json (ghi đè mỗi lần lưu).
 * - Mỗi lần GVCN lưu, script tự sinh thêm tệp báo cáo gọn bc_gvcn_{ten_lop}.json
 *   (chỉ chứa số liệu chuyên cần + bán trú theo ngày) để BGH tổng hợp rất nhanh.
 * - BGH / Quản trị gọi action=aggregateRange để lấy số liệu theo ngày / tuần / tháng.
 * - CHỈ tổng hợp tệp của GVCN (gvcn_*.json, teacherRole = homeroom). Tệp GV bộ môn (gvbm_*.json),
 *   BGH, Quản trị không được tính để không dôi số lớp / số học sinh.
 *
 * - V4.5: BGH / Quản trị KHÓA hoặc MỞ KHÓA điểm danh trong ngày (1 người, nhiều người hoặc tất cả):
 *   action=staffLock; khi bị khóa, nhân sự điểm danh sẽ nhận thông báo "đã khóa chốt số liệu".
 * - V4.4: Lưu số CCCD đầy đủ ngay trong hồ sơ nhân sự (nhansu_truong.json, tệp được khóa, không tải trực tiếp được)
 *   và hiển thị đầy đủ cho Quản trị / BGH trong danh sách + tổng hợp. Nhập lại Excel 1 lần để có số đầy đủ.
 * - V4.3: Quản trị xem được ĐẦY ĐỦ số CCCD của nhân sự (bản xem lưu ở Script Properties "scccd:<mã>",
 *   KHÔNG nằm trong thư mục Drive; chỉ trả về cho tài khoản Quản trị). Nhân sự nhập trước 4.3 cần nhập lại
 *   tệp Excel (hoặc sửa CCCD) để lưu số đầy đủ. Cập nhật: dán lại mã -> Triển khai -> Phiên bản mới (giữ URL).
 * - V4.2: CHẤM CÔNG GIÁO VIÊN – NHÂN VIÊN (nhansu_truong.json + chamcong_nhansu_YYYY-MM.json):
 *   nhân sự điểm danh bằng số CCCD + mật khẩu điểm danh, chỉ cho NGÀY HÔM NAY theo giờ máy chủ.
 *   ⚠️ Cập nhật từ V4.1: dán lại toàn bộ mã này rồi Triển khai -> Quản lý triển khai -> sửa -> Phiên bản mới
 *   (giữ nguyên URL /exec).
 * - V4: CSDL nhà trường (csdl_truong.json: trường + tài khoản, mật khẩu băm SHA-256) do Quản trị
 *   khởi tạo; đăng nhập BGH / giáo viên được kiểm tra tại đây (action=login). Tệp CSDL không bao giờ
 *   được trả ra ngoài.
 *
 * 🚀 TRIỂN KHAI (1 LẦN DUY NHẤT, do Quản trị nhà trường thực hiện)
 * 1. Mở https://script.google.com -> Dự án mới -> dán toàn bộ mã này.
 * 2. Điền FOLDER_ID của thư mục dùng chung bên dưới (hoặc để trống và truyền folderId từ phần mềm).
 * 3. Triển khai (Deploy) -> Triển khai mới -> Ứng dụng web:
 *    - Thực thi dưới dạng: Tôi (Me)
 *    - Ai có quyền truy cập: Bất kỳ ai (Anyone)   <-- BẮT BUỘC
 * 4. Sao chép URL Web App (đuôi /exec) dán vào phần mềm (mục Đồng bộ Google Drive).
 * =========================================================================================
 */

var FOLDER_ID = "__FOLDER_ID__";
var TARGET_FILENAME = "du_lieu_lop_hoc_hanh_phuc.json";
var REPORT_PREFIX = "bc_";
var SCRIPT_VERSION = "4.5";

// ---------------------------------------------------------------------------------------
// HTTP POST: lưu dữ liệu lớp
// ---------------------------------------------------------------------------------------
function doPost(e) {
  try {
    var contents = e && e.postData ? e.postData.contents : "";
    if (!contents) return createJsonResponse({ success: false, message: "Không nhận được dữ liệu (Empty payload)" });

    var payload = JSON.parse(contents);
    var folderId = payload.folderId || "";
    var action = payload.action || "saveClassData";

    if (action === "staffAuth" || action === "staffCheckIn" || action === "getStaffRoster" || action === "saveStaffRoster" || action === "staffAttendanceRange" || action === "staffLock") {
      var staffFolder = resolveFolder(folderId);
      if (!staffFolder) return createJsonResponse({ success: false, message: "Không tìm thấy thư mục Google Drive: " + folderId });
      if (action === "staffAuth") return createJsonResponse(handleStaffAuth(staffFolder, payload));
      if (action === "staffCheckIn") return createJsonResponse(handleStaffCheckIn(staffFolder, payload));
      if (action === "getStaffRoster") return createJsonResponse(handleGetStaffRoster(staffFolder, payload));
      if (action === "saveStaffRoster") return createJsonResponse(handleSaveStaffRoster(staffFolder, payload));
      if (action === "staffLock") return createJsonResponse(handleStaffLock(staffFolder, payload));
      return createJsonResponse(handleStaffAttendanceRange(staffFolder, payload));
    }

    if (action === "saveSchoolDb" || action === "getSchoolDb" || action === "login" || action === "changePassword") {
      var dbFolder = resolveFolder(folderId);
      if (!dbFolder) return createJsonResponse({ success: false, message: "Không tìm thấy thư mục Google Drive: " + folderId });
      if (action === "saveSchoolDb") return createJsonResponse(handleSaveSchoolDb(dbFolder, payload));
      if (action === "getSchoolDb") return createJsonResponse(handleGetSchoolDb(dbFolder, payload));
      if (action === "login") return createJsonResponse(handleLogin(dbFolder, payload));
      return createJsonResponse(handleChangePassword(dbFolder, payload));
    }

    var fileName = sanitizeFileName(payload.fileName || TARGET_FILENAME);
    if (isProtectedFile(fileName)) {
      return createJsonResponse({ success: false, message: "Không được ghi trực tiếp tệp cơ sở dữ liệu nhà trường." });
    }
    var jsonData = payload.data || payload;
    var contentString = typeof jsonData === "string" ? jsonData : JSON.stringify(jsonData);

    var folder = resolveFolder(folderId);
    if (!folder) {
      return createJsonResponse({
        success: false,
        message: "Không tìm thấy thư mục Google Drive với ID: " + folderId + ". Kiểm tra lại quyền chia sẻ thư mục."
      });
    }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(20000); } catch (_) {}
    var targetFile;
    try {
      targetFile = writeFileOverwrite(folder, fileName, contentString);

      // Sinh tệp báo cáo gọn cho file lớp (gvcn_*.json)
      if (isClassFileName(fileName)) {
        var dataObj = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
        var report = buildCompactReport(dataObj, fileName, new Date().toISOString());
        writeFileOverwrite(folder, REPORT_PREFIX + fileName, JSON.stringify(report));
      }
    } finally {
      try { lock.releaseLock(); } catch (_) {}
    }

    try { CacheService.getScriptCache().remove(cacheKey(folder.getId())); } catch (_) {}

    return createJsonResponse({
      success: true,
      message: "Đồng bộ dữ liệu lên Google Drive thành công (" + fileName + ")!",
      fileId: targetFile.getId(),
      fileName: fileName,
      fileUrl: targetFile.getUrl(),
      updatedAt: new Date().toISOString(),
      version: SCRIPT_VERSION
    });
  } catch (error) {
    return createJsonResponse({ success: false, message: "Lỗi xử lý Google Apps Script: " + error.toString() });
  }
}

// ---------------------------------------------------------------------------------------
// HTTP GET: ping / getLatest / listClassFiles / aggregateAllClasses / aggregateRange
// ---------------------------------------------------------------------------------------
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = params.action || "ping";
    var folderId = params.folderId || "";

    if (action === "ping") {
      return createJsonResponse({
        success: true,
        message: "Cầu nối Google Apps Script V" + SCRIPT_VERSION + " hoạt động tốt!",
        version: SCRIPT_VERSION,
        features: ["schoolDb", "staffAttendance"],
        timestamp: new Date().toISOString()
      });
    }

    var folder = resolveFolder(folderId);
    if (!folder) return createJsonResponse({ success: false, message: "Không tìm thấy thư mục Google Drive: " + folderId });

    if (action === "listSchools") {
      return createJsonResponse(handleListSchools(folder));
    }

    if (action === "getLatest" || action === "getFile") {
      var fileName = sanitizeFileName(params.fileName || params.targetFile || TARGET_FILENAME);
      if (isProtectedFile(fileName)) {
        return createJsonResponse({ success: false, message: "Tệp cơ sở dữ liệu nhà trường được bảo vệ." });
      }
      var files = folder.getFilesByName(fileName);
      // Không thay thế tệp lớp (gvcn_/gvbm_) bằng tệp chung — tránh nạp nhầm dữ liệu lớp khác
      if (!files.hasNext() && fileName !== TARGET_FILENAME && !params.strict && !/^(gvcn_|gvbm_)/i.test(fileName)) {
        files = folder.getFilesByName(TARGET_FILENAME);
      }
      if (files.hasNext()) {
        return ContentService.createTextOutput(files.next().getBlob().getDataAsString())
          .setMimeType(ContentService.MimeType.JSON);
      }
      return createJsonResponse({ success: false, message: "Chưa có tệp " + fileName + " trong thư mục này." });
    }

    if (action === "listClassFiles" || action === "listFiles") {
      var all = folder.getFiles();
      var list = [];
      while (all.hasNext()) {
        var f = all.next();
        var n = f.getName();
        if (!/\.json$/i.test(n)) continue;
        if (n.indexOf(REPORT_PREFIX) === 0) continue; // tệp báo cáo nội bộ
        if (isProtectedFile(n)) continue; // CSDL nhà trường / nhân sự / chấm công (được bảo vệ)
        list.push({
          id: f.getId(),
          name: n,
          sizeBytes: f.getSize(),
          updatedAt: f.getLastUpdated().toISOString(),
          updated: f.getLastUpdated().toISOString(),
          url: f.getUrl()
        });
      }
      return createJsonResponse({ success: true, files: list, total: list.length });
    }

    if (action === "aggregateRange") {
      var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
      var from = params.from || today;
      var to = params.to || today;
      return createJsonResponse(aggregateRange(folder, from, to));
    }

    if (action === "aggregateAllClasses") {
      var reportDate = params.date || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
      return createJsonResponse(aggregateSingleDay(folder, reportDate));
    }

    return createJsonResponse({ success: false, message: "Hành động không hợp lệ: " + action });
  } catch (err) {
    return createJsonResponse({ success: false, message: "Lỗi GET Google Apps Script: " + err.toString() });
  }
}

// =======================================================================================
// 🏫 V4: CƠ SỞ DỮ LIỆU NHÀ TRƯỜNG TRÊN DRIVE (csdl_truong.json)
//   - Lưu danh sách trường + tài khoản. Mật khẩu chỉ lưu dạng băm SHA-256 + salt.
//   - Tệp này KHÔNG bao giờ được trả ra ngoài qua getLatest / listFiles.
//   - Đăng nhập được kiểm tra ngay tại Apps Script (action=login), chỉ trả về hồ sơ không mật khẩu.
//   - Chỉ tài khoản Quản trị (admin / school_admin) mới ghi được CSDL trường.
// =======================================================================================
var SCHOOL_DB_FILE = "csdl_truong.json";
var PROTECTED_FILES = { "csdl_truong.json": true };
var ADMIN_ROLES = { admin: true, school_admin: true };

function hashPassword(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + "::" + String(password), Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}

function newSalt() {
  return Utilities.getUuid().replace(/-/g, "");
}

// Mật khẩu hiện tại để Quản trị tra cứu: lưu trong Script Properties (chỉ chủ script thấy,
// KHÔNG nằm trong thư mục Drive dùng chung). Chỉ trả về cho tài khoản Quản trị đã xác thực.
function setVisiblePassword(username, password) {
  try { PropertiesService.getScriptProperties().setProperty("pw:" + normalizeUsername(username), String(password)); } catch (_) {}
}
function getVisiblePassword(username) {
  try { return PropertiesService.getScriptProperties().getProperty("pw:" + normalizeUsername(username)) || ""; } catch (_) { return ""; }
}
function deleteVisiblePassword(username) {
  try { PropertiesService.getScriptProperties().deleteProperty("pw:" + normalizeUsername(username)); } catch (_) {}
}

function readSchoolDb(folder) {
  var files = folder.getFilesByName(SCHOOL_DB_FILE);
  if (!files.hasNext()) return null;
  try {
    return JSON.parse(files.next().getBlob().getDataAsString());
  } catch (_) {
    return null;
  }
}

function writeSchoolDb(folder, db) {
  db.version = SCRIPT_VERSION;
  db.updatedAt = new Date().toISOString();
  writeFileOverwrite(folder, SCHOOL_DB_FILE, JSON.stringify(db));
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function publicUser(u) {
  var out = {};
  for (var k in u) {
    if (k === "passwordHash" || k === "salt" || k === "password") continue;
    out[k] = u[k];
  }
  return out;
}

function findUser(db, username) {
  var key = normalizeUsername(username);
  var users = (db && db.users) || [];
  for (var i = 0; i < users.length; i++) {
    if (normalizeUsername(users[i].username) === key) return users[i];
  }
  return null;
}

function verifyUser(db, username, password) {
  var u = findUser(db, username);
  if (!u || !u.passwordHash || !u.salt) return null;
  return hashPassword(password, u.salt) === u.passwordHash ? u : null;
}

function isAdminUser(u) {
  return !!u && (ADMIN_ROLES[u.role] === true || u.isSchoolAdmin === true);
}

// Quản trị ghi toàn bộ CSDL trường (trường + tài khoản)
function handleSaveSchoolDb(folder, payload) {
  var auth = payload.auth || {};
  var incoming = payload.db || {};
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (_) {}
  try {
    var current = readSchoolDb(folder);
    var bootstrap = !current || !current.users || current.users.length === 0;
    if (!bootstrap) {
      var actor = verifyUser(current, auth.username, auth.password);
      if (!isAdminUser(actor)) {
        return { success: false, code: "UNAUTHORIZED", message: "Chỉ tài khoản Quản trị (đúng mật khẩu) mới được ghi cơ sở dữ liệu nhà trường." };
      }
    } else if (!auth.username || !auth.password) {
      return { success: false, code: "UNAUTHORIZED", message: "Thiếu thông tin tài khoản Quản trị để khởi tạo cơ sở dữ liệu." };
    }

    var oldUsers = (current && current.users) || [];
    var oldByName = {};
    for (var i = 0; i < oldUsers.length; i++) oldByName[normalizeUsername(oldUsers[i].username)] = oldUsers[i];

    var actorKey = normalizeUsername(auth.username);
    var nextUsers = [];
    var seen = {};
    var list = Array.isArray(incoming.users) ? incoming.users : [];
    for (var j = 0; j < list.length; j++) {
      var src = list[j] || {};
      var key = normalizeUsername(src.username);
      if (!key || seen[key]) continue;
      var prev = oldByName[key] || null;
      var rec = publicUser(src);
      rec.username = key;
      var plain = src.password || (bootstrap && key === actorKey ? auth.password : "");
      if (plain) {
        rec.salt = newSalt();
        rec.passwordHash = hashPassword(plain, rec.salt);
        rec.passwordUpdatedAt = new Date().toISOString();
        setVisiblePassword(key, plain);
      } else if (prev && prev.passwordHash) {
        rec.salt = prev.salt;
        rec.passwordHash = prev.passwordHash;
        rec.passwordUpdatedAt = prev.passwordUpdatedAt;
      } else {
        continue; // tài khoản mới phải có mật khẩu
      }
      seen[key] = true;
      nextUsers.push(rec);
    }

    // Chế độ GỘP (mặc định): giữ nguyên tài khoản không được gửi lên, chỉ xóa khi có yêu cầu rõ ràng
    var deleted = {};
    var delList = Array.isArray(incoming.deletedUsernames) ? incoming.deletedUsernames : [];
    for (var d = 0; d < delList.length; d++) deleted[normalizeUsername(delList[d])] = true;
    if (incoming.mode !== "replace") {
      for (var m = 0; m < oldUsers.length; m++) {
        var ok = normalizeUsername(oldUsers[m].username);
        if (!seen[ok] && !deleted[ok]) {
          seen[ok] = true;
          nextUsers.push(oldUsers[m]);
        }
      }
    }
    // Không cho xóa chính tài khoản đang thao tác
    if (deleted[actorKey]) delete deleted[actorKey];
    for (var dk in deleted) deleteVisiblePassword(dk);

    // Không bao giờ để mất tài khoản quản trị đang thao tác
    if (!seen[actorKey]) {
      if (oldByName[actorKey]) {
        nextUsers.push(oldByName[actorKey]);
      } else if (bootstrap) {
        var s0 = newSalt();
        setVisiblePassword(actorKey, auth.password);
        nextUsers.push({
          id: "user-" + actorKey, username: actorKey, fullName: auth.fullName || "Quản trị nhà trường",
          role: "admin", tenantType: "school", salt: s0, passwordHash: hashPassword(auth.password, s0),
          createdAt: Date.now()
        });
      }
    }

    // Trường học: gộp theo id / tên, xóa khi có yêu cầu
    var schoolsOut = ((current && current.schools) || []).slice();
    var delSchools = {};
    var delSchoolList = Array.isArray(incoming.deletedSchoolIds) ? incoming.deletedSchoolIds : [];
    for (var ds = 0; ds < delSchoolList.length; ds++) delSchools[String(delSchoolList[ds])] = true;
    var inSchools = Array.isArray(incoming.schools) ? incoming.schools : [];
    for (var si = 0; si < inSchools.length; si++) {
      var sc = inSchools[si];
      if (!sc || !sc.name) continue;
      var found = -1;
      for (var sj = 0; sj < schoolsOut.length; sj++) {
        if ((sc.id && schoolsOut[sj].id === sc.id) || String(schoolsOut[sj].name).trim().toUpperCase() === String(sc.name).trim().toUpperCase()) { found = sj; break; }
      }
      if (found >= 0) schoolsOut[found] = sc; else schoolsOut.push(sc);
    }
    schoolsOut = schoolsOut.filter(function (x) { return !delSchools[String(x.id)]; });

    var db = {
      schools: schoolsOut,
      users: nextUsers,
      updatedBy: actorKey
    };
    writeSchoolDb(folder, db);
    return {
      success: true,
      message: "Đã lưu cơ sở dữ liệu nhà trường lên Google Drive (" + db.schools.length + " trường, " + nextUsers.length + " tài khoản).",
      schools: db.schools,
      users: nextUsers.map(publicUser),
      updatedAt: db.updatedAt
    };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Quản trị đọc CSDL (không có mật khẩu)
function handleGetSchoolDb(folder, payload) {
  var db = readSchoolDb(folder);
  if (!db) return { success: true, initialized: false, schools: [], users: [] };
  var auth = payload.auth || {};
  var actor = verifyUser(db, auth.username, auth.password);
  if (!isAdminUser(actor) && !(actor && (actor.role === "bgh" || actor.isBgh))) {
    return { success: false, code: "UNAUTHORIZED", message: "Không có quyền đọc danh sách tài khoản." };
  }
  var withPasswords = isAdminUser(actor);
  var users = (db.users || []).map(function (u) {
    var pu = publicUser(u);
    if (withPasswords) pu.currentPassword = getVisiblePassword(u.username);
    return pu;
  });
  return { success: true, initialized: true, schools: db.schools || [], users: users, updatedAt: db.updatedAt };
}

function handleLogin(folder, payload) {
  var db = readSchoolDb(folder);
  if (!db || !db.users || db.users.length === 0) {
    return { success: false, code: "NOT_INITIALIZED", message: "Thư mục dùng chung chưa có cơ sở dữ liệu nhà trường. Quản trị cần khởi tạo trường trước." };
  }
  if (!findUser(db, payload.username)) {
    return { success: false, code: "NOT_FOUND", message: "Tài khoản chưa có trong cơ sở dữ liệu nhà trường trên Google Drive." };
  }
  var u = verifyUser(db, payload.username, payload.password);
  if (!u) return { success: false, code: "INVALID", message: "Sai mật khẩu." };
  if (u.disabled) return { success: false, code: "DISABLED", message: "Tài khoản đã bị khóa. Liên hệ Quản trị nhà trường." };
  return { success: true, user: publicUser(u), schools: db.schools || [] };
}

function handleChangePassword(folder, payload) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (_) {}
  try {
    var db = readSchoolDb(folder);
    var u = db ? verifyUser(db, payload.username, payload.oldPassword) : null;
    if (!u) return { success: false, code: "INVALID", message: "Mật khẩu hiện tại không đúng." };
    if (!payload.newPassword || String(payload.newPassword).length < 6) {
      return { success: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự." };
    }
    u.salt = newSalt();
    u.passwordHash = hashPassword(payload.newPassword, u.salt);
    u.passwordUpdatedAt = new Date().toISOString();
    u.mustChangePassword = false;
    writeSchoolDb(folder, db);
    setVisiblePassword(u.username, payload.newPassword);
    return { success: true, message: "Đã đổi mật khẩu thành công.", user: publicUser(u) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Danh sách trường (công khai, chỉ tên) để hiện ở màn hình đăng nhập
function handleListSchools(folder) {
  var db = readSchoolDb(folder);
  var schools = (db && db.schools) || [];
  return {
    success: true,
    initialized: !!(db && db.users && db.users.length),
    schools: schools.map(function (s) { return { id: s.id, name: s.name, code: s.code || "" }; })
  };
}

// ---------------------------------------------------------------------------------------
// Tiện ích tệp & thư mục
// ---------------------------------------------------------------------------------------
function resolveFolder(folderId) {
  var id = (folderId || "").trim();
  if (!id && FOLDER_ID && FOLDER_ID.indexOf("__") !== 0 && FOLDER_ID.indexOf("DIEN_") !== 0) id = FOLDER_ID;
  try {
    return id ? DriveApp.getFolderById(id) : DriveApp.getRootFolder();
  } catch (_) {
    return null;
  }
}

function sanitizeFileName(name) {
  var clean = String(name || TARGET_FILENAME).replace(/[\\\/:*?"<>|]/g, "_").trim();
  if (!/\.json$/i.test(clean)) clean += ".json";
  return clean;
}

function writeFileOverwrite(folder, fileName, contentString) {
  var files = folder.getFilesByName(fileName);
  var target = null;
  var duplicates = [];
  while (files.hasNext()) {
    var f = files.next();
    if (!target) target = f; else duplicates.push(f);
  }
  if (target) target.setContent(contentString);
  else target = folder.createFile(fileName, contentString, MimeType.PLAIN_TEXT);
  for (var i = 0; i < duplicates.length; i++) {
    try { duplicates[i].setTrashed(true); } catch (_) {}
  }
  return target;
}

function isClassFileName(name) {
  return /^gvcn_.+\.json$/i.test(name);
}

function cacheKey(folderId) {
  return "agg_" + folderId;
}

// ---------------------------------------------------------------------------------------
// Chuẩn hóa số liệu một lớp
//   Chuyên cần: có mặt = present + late; vắng = excused + sick + other + unexcused
//   Bán trú: đăng ký = số HS có bản ghi bán trú; ăn = eating
// ---------------------------------------------------------------------------------------
function countAttendance(recordsMap) {
  var r = { present: 0, late: 0, excused: 0, unexcused: 0, marked: 0 };
  for (var id in recordsMap) {
    var st = recordsMap[id];
    r.marked++;
    if (st === "present") r.present++;
    else if (st === "late") { r.late++; r.present++; }
    else if (st === "unexcused") r.unexcused++;
    else r.excused++; // excused, sick, other
  }
  return r;
}

function countBoarding(recordsMap) {
  var b = { registered: 0, actual: 0 };
  for (var id in recordsMap) {
    b.registered++;
    if (recordsMap[id] === "eating") b.actual++;
  }
  return b;
}

function buildCompactReport(classData, fileName, updatedAt) {
  var cInfo = classData.classInfo || {};
  var meta = classData.metadata || {};
  var students = Array.isArray(classData.students) ? classData.students : [];
  var total = meta.totalStudents || students.length || 0;
  var days = {};

  // 1. Nguồn chuẩn: dailyRecords (có details theo từng học sinh)
  var dr = classData.dailyRecords || {};
  for (var date in dr) {
    var rec = dr[date] || {};
    var day = {};
    if (rec.attendance) {
      var a = rec.attendance.details ? countAttendance(rec.attendance.details) : {
        present: rec.attendance.present || 0,
        late: rec.attendance.late || 0,
        excused: rec.attendance.excused || 0,
        unexcused: rec.attendance.unexcused || 0,
        marked: (rec.attendance.present || 0) + (rec.attendance.excused || 0) + (rec.attendance.unexcused || 0)
      };
      day.att = a;
    }
    if (rec.boarding) {
      day.brd = rec.boarding.details ? countBoarding(rec.boarding.details) : {
        registered: rec.boarding.registered || 0,
        actual: rec.boarding.actual || 0
      };
    }
    if (day.att || day.brd) days[date] = day;
  }

  // 2. Dự phòng: dữ liệu gốc attendanceRecords / boardingRecords
  var full = classData.fullClassroomData || classData;
  var classId = cInfo.id;
  var attList = Array.isArray(full.attendanceRecords) ? full.attendanceRecords : [];
  for (var i = 0; i < attList.length; i++) {
    var ar = attList[i];
    if (!ar || !ar.date || (classId && ar.classId && ar.classId !== classId)) continue;
    if (!days[ar.date]) days[ar.date] = {};
    if (!days[ar.date].att) days[ar.date].att = countAttendance(ar.records || {});
  }
  var brdList = Array.isArray(full.boardingRecords) ? full.boardingRecords : [];
  for (var j = 0; j < brdList.length; j++) {
    var br = brdList[j];
    if (!br || !br.date || (classId && br.classId && br.classId !== classId)) continue;
    if (!days[br.date]) days[br.date] = {};
    if (!days[br.date].brd) days[br.date].brd = countBoarding(br.records || {});
  }

  return {
    version: SCRIPT_VERSION,
    fileName: fileName,
    classId: cInfo.id || "",
    className: cInfo.name || meta.className || fileName.replace(/\.json$/i, "").replace(/^gvcn_?/i, "").toUpperCase(),
    grade: cInfo.grade || meta.grade || "",
    schoolName: meta.schoolName || cInfo.schoolName || "",
    teacherName: meta.teacherName || "",
    teacherUsername: meta.teacherUsername || "",
    teacherRole: meta.teacherRole || "homeroom",
    totalStudents: total,
    updatedAt: updatedAt,
    days: days
  };
}

/**
 * Đọc tất cả báo cáo gọn của các lớp. Nếu một lớp chưa có tệp bc_ (dữ liệu cũ),
 * tự đọc tệp gvcn_ gốc và sinh tệp bc_ cho lần sau.
 */
function loadAllClassReports(folder) {
  var cache = CacheService.getScriptCache();
  var key = cacheKey(folder.getId());
  try {
    var cached = cache.get(key);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  var reportsByFile = {};
  var classFiles = {};
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (n.indexOf(REPORT_PREFIX) === 0 && isClassFileName(n.substring(REPORT_PREFIX.length))) {
      try { reportsByFile[n.substring(REPORT_PREFIX.length)] = JSON.parse(f.getBlob().getDataAsString()); } catch (_) {}
    } else if (isClassFileName(n)) {
      classFiles[n] = f;
    }
  }

  var reports = [];
  for (var name in classFiles) {
    var rep = reportsByFile[name];
    var file = classFiles[name];
    var fileUpdated = file.getLastUpdated().toISOString();
    if (!rep || (rep.updatedAt && rep.updatedAt < fileUpdated && rep.version !== SCRIPT_VERSION)) {
      try {
        rep = buildCompactReport(JSON.parse(file.getBlob().getDataAsString()), name, fileUpdated);
        writeFileOverwrite(folder, REPORT_PREFIX + name, JSON.stringify(rep));
      } catch (_) { rep = null; }
    }
    // Chỉ tổng hợp số liệu của GVCN (lớp chủ nhiệm); bỏ qua tệp của GV bộ môn để không dôi lớp / dôi học sinh
    if (rep && rep.teacherRole !== "subject") reports.push(rep);
  }

  try {
    var str = JSON.stringify(reports);
    if (str.length < 90000) cache.put(key, str, 20);
  } catch (_) {}
  return reports;
}

// ---------------------------------------------------------------------------------------
// Tổng hợp theo khoảng ngày (BGH / Quản trị): ngày, hôm qua, tuần, tháng
// ---------------------------------------------------------------------------------------
function aggregateRange(folder, from, to) {
  var reports = loadAllClassReports(folder);
  var days = {};
  var classes = [];
  var totalStudents = 0;

  for (var i = 0; i < reports.length; i++) {
    var rep = reports[i];
    totalStudents += rep.totalStudents || 0;
    var lastReportDate = "";
    var perDay = {};
    for (var date in rep.days) {
      if (date > lastReportDate) lastReportDate = date;
      if (date < from || date > to) continue;
      var d = rep.days[date];
      if (!days[date]) {
        days[date] = {
          attendanceClasses: 0, students: 0, present: 0, late: 0, excused: 0, unexcused: 0,
          boardingClasses: 0, boardingRegistered: 0, boardingActual: 0
        };
      }
      var agg = days[date];
      if (d.att) {
        agg.attendanceClasses++;
        agg.students += rep.totalStudents || d.att.marked || 0;
        agg.present += d.att.present || 0;
        agg.late += d.att.late || 0;
        agg.excused += d.att.excused || 0;
        agg.unexcused += d.att.unexcused || 0;
      }
      if (d.brd) {
        agg.boardingClasses++;
        agg.boardingRegistered += d.brd.registered || 0;
        agg.boardingActual += d.brd.actual || 0;
      }
      perDay[date] = d;
    }
    classes.push({
      classId: rep.classId,
      className: rep.className,
      grade: rep.grade,
      schoolName: rep.schoolName,
      teacherName: rep.teacherName,
      teacherUsername: rep.teacherUsername,
      fileName: rep.fileName,
      totalStudents: rep.totalStudents || 0,
      updatedAt: rep.updatedAt,
      lastReportDate: lastReportDate,
      days: perDay
    });
  }

  return {
    success: true,
    version: SCRIPT_VERSION,
    from: from,
    to: to,
    totalClasses: classes.length,
    totalStudents: totalStudents,
    days: days,
    classes: classes,
    generatedAt: new Date().toISOString()
  };
}

// Tương thích ngược: báo cáo 1 ngày theo định dạng SchoolWideAggregationReport
function aggregateSingleDay(folder, reportDate) {
  var range = aggregateRange(folder, reportDate, reportDate);
  var classesDetail = [];
  var missing = [];
  var s = { totalStudents: 0, totalPresent: 0, totalExcused: 0, totalUnexcused: 0, totalLate: 0, reg: 0, act: 0 };

  for (var i = 0; i < range.classes.length; i++) {
    var c = range.classes[i];
    var d = c.days[reportDate] || {};
    var att = d.att || null;
    var brd = d.brd || null;
    s.totalStudents += c.totalStudents;
    if (att) {
      s.totalPresent += att.present; s.totalExcused += att.excused; s.totalUnexcused += att.unexcused; s.totalLate += att.late;
    } else {
      missing.push(c.className);
    }
    if (brd) { s.reg += brd.registered; s.act += brd.actual; }
    classesDetail.push({
      classId: c.classId,
      className: c.className,
      fileName: c.fileName,
      grade: c.grade,
      teacherName: c.teacherName,
      teacherUsername: c.teacherUsername,
      total: c.totalStudents,
      present: att ? att.present : 0,
      excused: att ? att.excused : 0,
      unexcused: att ? att.unexcused : 0,
      late: att ? att.late : 0,
      attendanceRate: att && c.totalStudents > 0 ? ((att.present / c.totalStudents) * 100).toFixed(2) + "%" : "0%",
      boardingRegistered: brd ? brd.registered : 0,
      boardingActual: brd ? brd.actual : 0,
      boardingCanceled: brd ? brd.registered - brd.actual : 0,
      boardingRate: brd && brd.registered > 0 ? ((brd.actual / brd.registered) * 100).toFixed(2) + "%" : "0%",
      status: att ? "reported" : "missing",
      updatedAt: c.updatedAt
    });
  }

  var reportedStudents = 0;
  for (var k = 0; k < range.classes.length; k++) {
    if (range.classes[k].days[reportDate] && range.classes[k].days[reportDate].att) reportedStudents += range.classes[k].totalStudents;
  }

  return {
    success: true,
    reportDate: reportDate,
    school: "Toàn trường",
    summary: {
      totalClasses: classesDetail.length,
      totalStudents: s.totalStudents,
      totalPresent: s.totalPresent,
      totalExcused: s.totalExcused,
      totalUnexcused: s.totalUnexcused,
      totalLate: s.totalLate,
      attendanceRate: reportedStudents > 0 ? ((s.totalPresent / reportedStudents) * 100).toFixed(2) + "%" : "0%",
      totalBoardingRegistered: s.reg,
      totalBoardingActual: s.act,
      totalBoardingCanceled: s.reg - s.act,
      boardingRate: s.reg > 0 ? ((s.act / s.reg) * 100).toFixed(2) + "%" : "0%"
    },
    classesDetail: classesDetail,
    missingClasses: missing,
    generatedAt: new Date().toISOString()
  };
}

// =======================================================================================
// 👩‍🏫 V4.2: CHẤM CÔNG (ĐIỂM DANH) GIÁO VIÊN – NHÂN VIÊN TOÀN TRƯỜNG
//   - nhansu_truong.json: danh sách nhân sự. Số CCCD & mật khẩu điểm danh chỉ lưu dạng BĂM
//     (CCCD băm với "muối chung" giữ trong Script Properties để tra cứu; mật khẩu băm + salt riêng).
//   - chamcong_nhansu_YYYY-MM.json: điểm danh theo tháng { days: { "YYYY-MM-DD": { maGV: {...} } } }.
//   - NGÀY ĐIỂM DANH DO MÁY CHỦ QUYẾT ĐỊNH (giờ Việt Nam) → không điểm danh bù ngày cũ / ngày chưa tới.
//   - Hai tệp trên được bảo vệ: không trả ra qua getLatest / listFiles, không ghi trực tiếp được.
//   - Quản trị (admin / school_admin) quản lý danh sách; BGH + Quản trị xem tổng hợp.
// =======================================================================================
var STAFF_FILE = "nhansu_truong.json";
var STAFF_ATT_PREFIX = "chamcong_nhansu_";
var STAFF_STATUSES = { present: true, sick_leave: true, personal_unpaid: true };
var STAFF_TZ = "GMT+7";

function isProtectedFile(name) {
  var n = String(name || "").toLowerCase();
  return PROTECTED_FILES[n] === true || n === STAFF_FILE || n.indexOf(STAFF_ATT_PREFIX) === 0;
}

function staffToday() {
  return Utilities.formatDate(new Date(), STAFF_TZ, "yyyy-MM-dd");
}

function staffPepper() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty("staff_pepper");
  if (!p) { p = newSalt(); props.setProperty("staff_pepper", p); }
  return p;
}

function normalizeCccd(v) {
  return String(v || "").replace(/\D/g, "");
}

function cccdHash(cccd) {
  return hashPassword(normalizeCccd(cccd), "cccd::" + staffPepper());
}

function normalizeStaffCode(v) {
  return String(v || "").trim().toUpperCase();
}

function readJsonFile(folder, name, fallback) {
  var files = folder.getFilesByName(name);
  if (!files.hasNext()) return fallback;
  try { return JSON.parse(files.next().getBlob().getDataAsString()); } catch (_) { return fallback; }
}

function readStaffDb(folder) {
  var db = readJsonFile(folder, STAFF_FILE, null);
  if (!db || !db.staff) db = { staff: [] };
  return db;
}

function publicStaff(s) {
  return {
    code: s.code, name: s.name, position: s.position || "", dept: s.dept || "", gender: s.gender || "",
    phone: s.phone || "", order: s.order || 0, cccdLast4: s.cccdLast4 || "", cccd: s.cccdFull || "", disabled: !!s.disabled,
    hasPin: !!s.pinHash, updatedAt: s.updatedAt || ""
  };
}

function findStaffByCccd(db, cccd) {
  var digits = normalizeCccd(cccd);
  if (digits.length < 9) return null;
  var h = cccdHash(digits);
  for (var i = 0; i < db.staff.length; i++) if (db.staff[i].cccdHash === h) return db.staff[i];
  return null;
}

function verifyStaff(folder, cccd, pin) {
  var db = readStaffDb(folder);
  var s = findStaffByCccd(db, cccd);
  if (!s || !s.pinHash) return { ok: false, code: "INVALID", message: "Số CCCD hoặc mật khẩu điểm danh không đúng." };
  if (hashPassword(String(pin || ""), s.salt) !== s.pinHash) return { ok: false, code: "INVALID", message: "Số CCCD hoặc mật khẩu điểm danh không đúng." };
  if (s.disabled) return { ok: false, code: "DISABLED", message: "Tài khoản điểm danh đã bị khóa. Liên hệ Quản trị nhà trường." };
  return { ok: true, staff: s, db: db };
}

function monthFileName(dateStr) {
  return STAFF_ATT_PREFIX + String(dateStr).slice(0, 7) + ".json";
}

function readMonth(folder, dateStr) {
  var m = readJsonFile(folder, monthFileName(dateStr), null);
  if (!m || !m.days) m = { month: String(dateStr).slice(0, 7), days: {} };
  return m;
}

/** Quản trị (admin/school_admin) hoặc BGH đã xác thực bằng tài khoản trong csdl_truong.json */
function staffActor(folder, auth, needAdmin) {
  var sdb = readSchoolDb(folder);
  var actor = sdb ? verifyUser(sdb, (auth || {}).username, (auth || {}).password) : null;
  if (!actor || actor.disabled) return null;
  if (isAdminUser(actor)) return actor;
  if (!needAdmin && (actor.role === "bgh" || actor.isBgh)) return actor;
  return null;
}

// --- Giáo viên/nhân viên: xác thực + xem trạng thái hôm nay
function handleStaffAuth(folder, payload) {
  var v = verifyStaff(folder, payload.cccd, payload.pin);
  if (!v.ok) return { success: false, code: v.code, message: v.message };
  var today = staffToday();
  var month = readMonth(folder, today);
  var rec = (month.days[today] || {})[v.staff.code] || null;
  var locked = isStaffLocked(month, today, v.staff.code);
  return { success: true, staff: publicStaff(v.staff), today: today, record: rec, locked: locked, lockMessage: locked ? STAFF_LOCK_MESSAGE : "", serverTime: new Date().toISOString() };
}

// ---------------------------------------------------------------- V4.5: khóa chốt số liệu điểm danh theo ngày
var STAFF_LOCK_MESSAGE = "Hiện tại chức năng điểm danh trong ngày đã được quản trị nhà trường khóa chốt số liệu.";

// month.locks[ngày] = { all: true|false, codes: { MÃ: true }, at, by }
function isStaffLocked(month, dateStr, code) {
  var L = month && month.locks && month.locks[dateStr];
  if (!L) return false;
  return L.all === true || !!(L.codes && L.codes[code]);
}

// --- BGH / Quản trị: khóa hoặc mở khóa điểm danh (1 người / nhiều người / tất cả)
function handleStaffLock(folder, payload) {
  var actor = staffActor(folder, payload.auth, false);
  if (!actor) return { success: false, code: "UNAUTHORIZED", message: "Chỉ BGH / Quản trị được khóa điểm danh." };
  var today = staffToday();
  var date = String(payload.date || today).slice(0, 10);
  if (date > today) return { success: false, message: "Không khóa được ngày chưa tới." };
  var doLock = payload.lock !== false;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (_) {}
  try {
    var month = readMonth(folder, date);
    if (!month.locks) month.locks = {};
    var L = month.locks[date] || { all: false, codes: {} };
    if (!L.codes) L.codes = {};
    var codes = (payload.codes || []).map(normalizeStaffCode).filter(function (c) { return !!c; });
    if (payload.all) {
      L.all = doLock;
      L.codes = {};
    } else if (doLock) {
      for (var i = 0; i < codes.length; i++) L.codes[codes[i]] = true;
    } else {
      if (L.all) {
        // Đang khóa toàn bộ, mở cho một số người -> chuyển sang khóa từng người (trừ những người được mở)
        var keep = {};
        var db = readStaffDb(folder);
        for (var j = 0; j < db.staff.length; j++) keep[db.staff[j].code] = true;
        for (var k = 0; k < codes.length; k++) delete keep[codes[k]];
        L.all = false;
        L.codes = keep;
      } else {
        for (var m = 0; m < codes.length; m++) delete L.codes[codes[m]];
      }
    }
    L.at = new Date().toISOString();
    L.by = actor.username;
    if (!L.all && Object.keys(L.codes).length === 0) delete month.locks[date];
    else month.locks[date] = L;
    month.updatedAt = L.at;
    writeFileOverwrite(folder, monthFileName(date), JSON.stringify(month));
    return { success: true, date: date, lock: month.locks[date] || null };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// --- Giáo viên/nhân viên: điểm danh CHO HÔM NAY (ngày do máy chủ xác định)
function handleStaffCheckIn(folder, payload) {
  var status = String(payload.status || "");
  if (!STAFF_STATUSES[status]) return { success: false, message: "Trạng thái điểm danh không hợp lệ." };
  var today = staffToday();
  if (payload.date && String(payload.date) !== today) {
    return { success: false, code: "NOT_TODAY", today: today, message: "Chỉ điểm danh được cho ngày hôm nay (" + today + ")." };
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (_) {}
  try {
    var v = verifyStaff(folder, payload.cccd, payload.pin);
    if (!v.ok) return { success: false, code: v.code, message: v.message };
    var month = readMonth(folder, today);
    if (isStaffLocked(month, today, v.staff.code)) {
      return { success: false, code: "LOCKED", locked: true, message: STAFF_LOCK_MESSAGE };
    }
    if (!month.days[today]) month.days[today] = {};
    var prev = month.days[today][v.staff.code];
    var nowIso = new Date().toISOString();
    var cleanNote = String(payload.note || "").slice(0, 300);
    // Lịch sử MỌI lần điểm danh trong ngày (lần 1, lần 2…) để nhà trường / kế toán đối chiếu
    var history = (prev && prev.history) ? prev.history.slice(0, 19)
      : (prev ? [{ status: prev.status, note: prev.note || "", at: prev.at }] : []);
    history.push({ status: status, note: cleanNote, at: nowIso });
    month.days[today][v.staff.code] = {
      status: status,
      note: cleanNote,
      at: nowIso,
      firstAt: prev && prev.firstAt ? prev.firstAt : nowIso,
      attempt: history.length,
      edits: history.length - 1,
      history: history
    };
    month.updatedAt = nowIso;
    writeFileOverwrite(folder, monthFileName(today), JSON.stringify(month));
    return { success: true, today: today, record: month.days[today][v.staff.code], staff: publicStaff(v.staff), message: "Đã ghi nhận điểm danh ngày " + today + "." };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// --- Quản trị: đọc danh sách nhân sự (kèm mật khẩu điểm danh đang dùng để cấp lại cho nhân sự)
function handleGetStaffRoster(folder, payload) {
  var actor = staffActor(folder, payload.auth, false);
  if (!actor) return { success: false, code: "UNAUTHORIZED", message: "Chỉ Quản trị / BGH được xem danh sách nhân sự." };
  var db = readStaffDb(folder);
  var withPins = isAdminUser(actor);
  var props = PropertiesService.getScriptProperties();
  var list = db.staff.map(function (s) {
    var p = publicStaff(s);
    if (withPins) {
      p.currentPin = props.getProperty("spin:" + s.code) || "";
      p.currentCccd = props.getProperty("scccd:" + s.code) || "";
    }
    return p;
  });
  return { success: true, staff: list, today: staffToday(), updatedAt: db.updatedAt || "" };
}

// --- Quản trị: thêm / sửa / xóa nhân sự (chế độ gộp theo mã GV)
function handleSaveStaffRoster(folder, payload) {
  var actor = staffActor(folder, payload.auth, true);
  if (!actor) return { success: false, code: "UNAUTHORIZED", message: "Chỉ tài khoản Quản trị được cập nhật danh sách nhân sự." };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (_) {}
  try {
    var db = readStaffDb(folder);
    var props = PropertiesService.getScriptProperties();
    var byCode = {};
    for (var i = 0; i < db.staff.length; i++) byCode[db.staff[i].code] = db.staff[i];
    var errors = [];
    var upserts = payload.staff || [];
    for (var j = 0; j < upserts.length; j++) {
      var it = upserts[j] || {};
      var code = normalizeStaffCode(it.code);
      if (!code) { errors.push("Dòng " + (j + 1) + ": thiếu mã giáo viên."); continue; }
      var s = byCode[code];
      var isNew = !s;
      if (isNew) { s = { code: code, salt: newSalt(), createdAt: new Date().toISOString() }; }
      if (it.name !== undefined) s.name = String(it.name || "").trim();
      if (!s.name) { errors.push(code + ": thiếu họ tên."); if (isNew) continue; }
      if (it.position !== undefined) s.position = String(it.position || "").trim();
      if (it.dept !== undefined) s.dept = String(it.dept || "").trim();
      if (it.gender !== undefined) s.gender = String(it.gender || "").trim();
      if (it.phone !== undefined) s.phone = String(it.phone || "").trim();
      if (it.order !== undefined) s.order = Number(it.order) || 0;
      if (it.disabled !== undefined) s.disabled = !!it.disabled;
      if (it.cccd) {
        var digits = normalizeCccd(it.cccd);
        if (digits.length < 9 || digits.length > 12) { errors.push(code + ": số CCCD không hợp lệ."); if (isNew) continue; }
        else {
          var h = cccdHash(digits);
          var dup = null;
          for (var k in byCode) if (byCode[k] !== s && byCode[k].cccdHash === h) dup = byCode[k];
          if (dup) { errors.push(code + ": số CCCD trùng với " + dup.code + "."); if (isNew) continue; }
          else { s.cccdHash = h; s.cccdLast4 = digits.slice(-4); s.cccdFull = digits; props.setProperty("scccd:" + code, digits); }
        }
      }
      if (isNew && !s.cccdHash) { errors.push(code + ": thiếu số CCCD."); continue; }
      if (it.pin) {
        var pin = String(it.pin);
        if (pin.length < 4) { errors.push(code + ": mật khẩu điểm danh phải có ít nhất 4 ký tự."); }
        else {
          s.salt = newSalt();
          s.pinHash = hashPassword(pin, s.salt);
          props.setProperty("spin:" + code, pin);
        }
      }
      s.updatedAt = new Date().toISOString();
      byCode[code] = s;
    }
    var deleted = payload.deletedCodes || [];
    for (var d = 0; d < deleted.length; d++) {
      var dc = normalizeStaffCode(deleted[d]);
      if (byCode[dc]) { delete byCode[dc]; try { props.deleteProperty("spin:" + dc); props.deleteProperty("scccd:" + dc); } catch (_) {} }
    }
    db.staff = Object.keys(byCode).map(function (c) { return byCode[c]; });
    db.updatedAt = new Date().toISOString();
    db.updatedBy = actor.username;
    writeFileOverwrite(folder, STAFF_FILE, JSON.stringify(db));
    return handleGetStaffRosterResult(db, props, errors);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function handleGetStaffRosterResult(db, props, errors) {
  return {
    success: true,
    errors: errors,
    staff: db.staff.map(function (s) { var p = publicStaff(s); p.currentPin = props.getProperty("spin:" + s.code) || ""; p.currentCccd = props.getProperty("scccd:" + s.code) || ""; return p; }),
    today: staffToday(),
    updatedAt: db.updatedAt
  };
}

// --- BGH / Quản trị: dữ liệu điểm danh trong khoảng ngày (tối đa 400 ngày)
function handleStaffAttendanceRange(folder, payload) {
  var actor = staffActor(folder, payload.auth, false);
  if (!actor) return { success: false, code: "UNAUTHORIZED", message: "Chỉ Quản trị / BGH được xem tổng hợp chấm công." };
  var today = staffToday();
  var from = String(payload.from || today).slice(0, 10);
  var to = String(payload.to || today).slice(0, 10);
  if (from > to) { var t = from; from = to; to = t; }
  var days = {};
  var locks = {};
  var month = from.slice(0, 7);
  var guard = 0;
  while (month <= to.slice(0, 7) && guard++ < 14) {
    var m = readJsonFile(folder, STAFF_ATT_PREFIX + month + ".json", null);
    if (m && m.days) {
      for (var dk in m.days) if (dk >= from && dk <= to) days[dk] = m.days[dk];
    }
    if (m && m.locks) {
      for (var lk in m.locks) if (lk >= from && lk <= to) locks[lk] = m.locks[lk];
    }
    var y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7)) + 1;
    if (mo > 12) { mo = 1; y++; }
    month = y + "-" + (mo < 10 ? "0" : "") + mo;
  }
  var db = readStaffDb(folder);
  var showCccd = isAdminUser(actor);
  var props = PropertiesService.getScriptProperties();
  var staff = db.staff.map(function (s) {
    var p = publicStaff(s);
    if (showCccd) p.currentCccd = props.getProperty("scccd:" + s.code) || "";
    return p;
  });
  return { success: true, today: today, from: from, to: to, staff: staff, days: days, locks: locks };
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
