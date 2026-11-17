/* If a page is opened by double-clicking the file (file://), the server is not running and
   nothing can work. Show clear steps instead of a broken, unstyled page. */
(function () {
  if (location.protocol !== 'file:') return;
  var page = /admin\.html$/i.test(location.pathname) ? 'admin.html' : '';
  var box = document.createElement('div');
  box.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#3B2118;color:#FFFDF8;overflow:auto;padding:24px;font-family:Segoe UI,Arial,sans-serif;');
  box.innerHTML =
    '<div style="max-width:640px;margin:30px auto;background:#542D1E;border:3px solid #D6B77A;border-radius:24px;padding:28px 26px;line-height:1.55">' +
    '<div style="font-size:48px">🎂</div>' +
    '<h1 style="margin:.2em 0;color:#F0D59A;font-size:28px">One more step!</h1>' +
    '<p style="font-size:18px">This page was opened by double-clicking the file. It must be opened from the <b>running website</b> instead.</p>' +
    '<ol style="font-size:18px;padding-left:22px">' +
    '<li>Close this tab.</li>' +
    '<li>Open the main folder <b>nanati-birthday</b> and double-click <b>start.bat</b>. A black window opens - <b>leave it open</b>.</li>' +
    '<li>In Chrome, type this address and press Enter:<br>' +
    '<span style="display:inline-block;margin-top:8px;background:#FFFDF8;color:#3B2118;padding:8px 14px;border-radius:10px;font-weight:700;font-size:20px">http://localhost:3000/' + page + '</span></li>' +
    '</ol>' +
    '<p style="font-size:15px;color:#E8D8C3">If the black window shows a red error or closes by itself, take a photo of it and send it to me.</p>' +
    '</div>';
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
  if (document.readyState !== 'loading') document.body.appendChild(box);
})();
