const translations = {
  en: {
    skip:'Skip to content', navFeatures:'Features', navInstall:'Get started', eyebrow:'A LITTLE LESS CLASSROOM FRICTION', headline:'Your classroom,<br><em>within reach.</em>', description:'One companion for your iClicker routine. Keep the classroom ready, catch the next question, and stay in control.', downloadMac:'Download for macOS', downloadWindows:'Download for Windows', releaseFallback:'Latest release on GitHub', releaseNotes:'Release notes ↗', platforms:'macOS 13+ · Apple Silicon & Intel · Windows 10/11 x64', local:'LOCAL WORKSPACE', workspace:'WORKSPACE', myCourses:'My courses', connection:'Connection', chromeReady:'Chrome ready', previewSubtitle:'A quiet place to get ready.', sample:'SAMPLE COURSE', sampleCourse:'Introduction to ideas', reminders:'Answer reminders', startSession:'Start session', noteTitle:'Your space. Your session.', noteBody:'Course data stays on your computer.', previewCaption:'Illustrative preview · synthetic course data', principleOne:'Built for your desktop', principleTwo:'Local-first by design', principleThree:'You stay in control', featuresEyebrow:'A CALMER ROUTINE', featuresTitle:'Less setup.<br>More presence.', featuresIntro:'A few thoughtful tools for the moments between joining a class and answering its next question.', featureOneTitle:'A real classroom window', featureOneBody:'A dedicated Chrome window keeps your classroom available. Complete school sign-in and interact with the page whenever you need.', featureTwoTitle:'Reminders when it matters', featureTwoBody:'Get notified when a question needs your answer. Choose reminder mode, or automatic A for eligible single-choice questions.', featureThreeTitle:'A workspace of your own', featureThreeBody:'Save courses and settings on your computer. Login session storage is encrypted with the operating system; passwords are never saved.', modernFeatures:'Also included: background mode, scheduled starts, classroom records, and updates you can install from the app.', installEyebrow:'FROM DOWNLOAD TO CLASSROOM', installTitle:'Make yourself<br>at home.', installIntro:'You need Google Chrome and your iClicker account. No Node.js or developer tools required.', macOne:'Download the universal DMG. Open it and drag Attendance Handler into Applications.', macTwo:'Install Google Chrome in Applications, then open Attendance Handler.', macThree:'Sign in through the dedicated Chrome window and configure your course.', macNotice:'This free preview is ad-hoc signed and not notarized. macOS may require approval in System Settings → Privacy & Security after you verify the download source.', winOne:'Download and run the installer for your Windows user account.', winTwo:'Install Google Chrome, then open Attendance Handler from the Start menu.', winThree:'Sign in through the dedicated Chrome window and configure your course.', winNotice:"This free preview is unsigned. Windows may show an unknown-publisher or SmartScreen prompt. Verify that the installer came from this project's GitHub release.", alternative:'Looking for ZIP downloads or checksums?', allReleases:'View all release files ↗', previewEyebrow:'AN EARLY PREVIEW', closingTitle:'Small companion.<br>Clear boundaries.', closingBody:'Use Attendance Handler only where your course policy permits. It is an independent project, not affiliated with iClicker or your school. Live classroom verification is still pending.', privacy:'Privacy & local storage ↗', feedback:'Report an issue ↗', footer:'Built for a calmer classroom workflow.'
  },
  zh: {
    skip:'跳到正文', navFeatures:'功能介绍', navInstall:'开始使用', eyebrow:'让上课准备，再轻松一点', headline:'课堂在身边，<br><em>心思在课堂。</em>', description:'为你的 iClicker 课堂准备一个小助手。打开课堂、留意题目，在需要时及时提醒，操作始终由你掌握。', downloadMac:'下载 macOS 版', downloadWindows:'下载 Windows 版', releaseFallback:'查看 GitHub 最新发布', releaseNotes:'更新说明 ↗', platforms:'macOS 13+ · Apple Silicon 与 Intel · Windows 10/11 x64', local:'本地工作空间', workspace:'工作空间', myCourses:'我的课程', connection:'连接与提醒', chromeReady:'Chrome 已就绪', previewSubtitle:'留一点空间，准备好上课。', sample:'示例课程', sampleCourse:'思考方法导论', reminders:'提醒我作答', startSession:'开始上课', noteTitle:'你的空间，你的课堂。', noteBody:'课程数据保存在这台电脑。', previewCaption:'界面示意 · 仅使用虚构课程数据', principleOne:'为桌面而设计', principleTwo:'数据优先保存在本地', principleThree:'始终由你掌握', featuresEyebrow:'从容一点的课堂日常', featuresTitle:'少一点准备，<br>多一点专注。', featuresIntro:'从加入课堂到回答下一道题，用几个简单的功能，让重复的步骤更轻松。', featureOneTitle:'真实、可操作的课堂窗口', featureOneBody:'专用 Chrome 窗口让课堂页面随时可用。学校登录验证、手动查看和作答，都可以直接在页面上完成。', featureTwoTitle:'在需要时提醒你', featureTwoBody:'遇到需要作答的题目，及时发送系统提醒。可以选择提醒模式，或为符合条件的单选题自动选择 A。', featureThreeTitle:'留在自己电脑里的工作空间', featureThreeBody:'课程和设置保存在本地。登录会话使用操作系统提供的加密存储，应用不会保存你的密码。', modernFeatures:'还包括：后台模式、定时开启、课堂记录，以及可以直接在应用中安装的更新。', installEyebrow:'从下载，到开始上课', installTitle:'几步就绪，<br>安心开始。', installIntro:'准备好 Google Chrome 和你的 iClicker 账号。不需要安装 Node.js 或开发工具。', macOne:'下载通用 DMG，打开后把 Attendance Handler 拖入 Applications（应用程序）。', macTwo:'把 Google Chrome 安装在应用程序目录，然后打开 Attendance Handler。', macThree:'在专用 Chrome 窗口登录账号，导入或配置你的课程。', macNotice:'免费预览版使用临时签名，尚未经过 Apple 公证。确认下载来源后，macOS 可能要求在“系统设置 → 隐私与安全性”中允许打开。', winOne:'下载并运行安装程序，安装到当前 Windows 用户账户。', winTwo:'安装 Google Chrome，然后从开始菜单打开 Attendance Handler。', winThree:'在专用 Chrome 窗口登录账号，导入或配置你的课程。', winNotice:'免费预览版暂未签名，Windows 可能显示未知发布者或 SmartScreen 提示。请确认安装包来自本项目的 GitHub Release。', alternative:'需要 ZIP 下载包或校验文件？', allReleases:'查看所有发布文件 ↗', previewEyebrow:'仍在逐步完善的预览版', closingTitle:'一个小助手，<br>清楚的边界。', closingBody:'请在课程政策允许的情况下使用。本项目独立开发，与 iClicker 及你的学校没有关联。真实课堂的最终验证仍待完成。', privacy:'隐私与本地存储 ↗', feedback:'反馈问题 ↗', footer:'为更从容的课堂日常而制作。'
  }
};
let language = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
try { const saved = localStorage.getItem('attendance-site-language'); if (saved === 'zh' || saved === 'en') language = saved; } catch {}
let release;
function render() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = language === 'zh' ? 'Attendance Handler · 课堂助手' : 'Attendance Handler — Your classroom, within reach';
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const value = translations[language][element.dataset.i18n];
    if (value !== undefined) {
      // Only fixed, authored translations use HTML; fetched metadata is text only.
      if (['headline','featuresTitle','installTitle','closingTitle'].includes(element.dataset.i18n)) element.innerHTML = value;
      else element.textContent = value;
    }
  });
  const switcher = document.getElementById('language'); switcher.textContent = language === 'en' ? '中文' : 'EN'; switcher.setAttribute('aria-label', language === 'en' ? 'Switch to Chinese' : '切换到英文');
  if (release) {
    document.getElementById('release-version').textContent = `v${release.version}`;
    document.getElementById('release-date').textContent = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { year:'numeric', month:'short', day:'numeric', timeZone:'UTC' }).format(new Date(release.publishedAt));
  }
}
document.getElementById('language').addEventListener('click', () => { language = language === 'en' ? 'zh' : 'en'; try { localStorage.setItem('attendance-site-language', language); } catch {} render(); });
render();
try {
  const response = await fetch(new URL('version.json', import.meta.url), { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('No release metadata');
  const value = await response.json();
  if (value.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(value.version) || !Number.isFinite(Date.parse(value.publishedAt))) throw new Error('Invalid metadata');
  const base = `https://github.com/tzuo5/attendance-handler/releases/download/v${value.version}/`;
  if (value.releaseUrl !== `https://github.com/tzuo5/attendance-handler/releases/tag/v${value.version}` || value.downloads?.mac !== `${base}Attendance-Handler-${value.version}-mac-universal.dmg` || value.downloads?.windows !== `${base}Attendance-Handler-${value.version}-win-x64-Setup.exe`) throw new Error('Invalid download links');
  release = value;
  document.getElementById('mac-download').href = value.downloads.mac;
  document.getElementById('windows-download').href = value.downloads.windows;
  document.getElementById('release-notes').href = value.releaseUrl;
  document.getElementById('modern-features').hidden = !value.updates;
  render();
} catch { document.getElementById('release-date').hidden = true; document.querySelector('.divider').hidden = true; }
