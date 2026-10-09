async (page) => {
  const root = __ROOT__;
  const phase = __PHASE__;
  page.setDefaultTimeout(12000);
  const assets = root + '/docs/manual/assets/';
  if (!page.url().startsWith('http://127.0.0.1:3004/')) throw new Error('Use the isolated manual fixture server.');
  await page.clock.setFixedTime(new Date('2026-10-04T18:35:00+08:00'));
  const button = name => page.getByRole('button', {name, exact:true});
  const shot = async (name, locator) => {
    await page.waitForTimeout(200);
    await locator.screenshot({path:assets + name + '.png', animations:'disabled'});
  };
  const main = () => page.locator('main.workspace');
  const dialog = () => page.getByRole('dialog');
  const close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
  const login = async id => {
    await page.goto('http://127.0.0.1:3004/');
    await page.waitForFunction(() => !document.body.innerText.includes('Connecting…') && !document.body.innerText.includes('连接中…'));
    if (await button('Sign out').count()) await button('Sign out').click();
    await page.getByRole('textbox',{name:'Institutional ID',exact:true}).fill(id);
    await page.getByRole('textbox',{name:'Password',exact:true}).fill('SchedU-demo-2026!');
    await button('Sign in').click();
    await page.locator('main.workspace').waitFor({state:'attached'});
  };
  const navigate = async name => {
    await button(name).first().click();
    await page.evaluate(() => window.scrollTo(0,0));
    await page.waitForTimeout(200);
  };
  const top = async (name, height=760) => {
    await page.evaluate(() => window.scrollTo(0,0));
    const box = await main().boundingBox();
    await page.screenshot({path:assets+name+'.png',clip:{x:box.x,y:box.y,width:box.width,height},animations:'disabled'});
  };
  // Crop at a complete table-row boundary. No labels or other pixels are altered.
  const throughRows = async (name, container, rows) => {
    await page.evaluate(() => window.scrollTo(0,0));
    const start = await container.boundingBox();
    const end = await container.locator('tbody tr').nth(rows-1).boundingBox();
    await page.screenshot({path:assets+name+'.png',clip:{x:start.x,y:start.y,width:start.width,height:end.y+end.height-start.y},animations:'disabled'});
  };
  if (phase === 'student') {
    await login('20260001');
    await shot('student-overview',page.locator('body'));
    await navigate('My profile');
    await shot('profile', page.locator('.profile-form'));
    await navigate('Book a tutorial');
    await button('Tue 06').click();
    await page.getByRole('combobox',{name:'Select a time slot',exact:true}).click();
    await page.getByRole('option').filter({hasText:'18:30–18:40'}).click();
    await page.getByRole('textbox',{name:'What would you like to work on? (optional)',exact:true}).fill('Checking the signs in a two-loop circuit');
    await shot('book-tutorial',page.locator('.booking-grid'));
    await button('Review booking').click();
    await shot('review-booking',dialog());
    await button('Confirm booking').click();
    await dialog().waitFor({state:'hidden'});
    await page.getByRole('tab',{name:'Upcoming & active',exact:true}).waitFor();
    await top('student-bookings',810);
    await page.locator('.booking-row').filter({hasText:'Approved'}).getByRole('button',{name:'View details',exact:true}).click();
    await shot('booking-details',dialog());
    await button('Cancel booking').click();
    await shot('cancel-booking',page.getByRole('alertdialog'));
    await button('Keep booking').click();
    await close();
    await navigate('My feedback');
    await shot('student-feedback',page.locator('.feedback-grid'));
  }
  if (phase === 'first-login') {
    if (!(await page.getByRole('heading',{name:'Make your account yours.',exact:true}).count())) await login('20260002');
    await shot('first-login',dialog());
    await button('Keep my initial password').click();
    await button('Sign out').click();
    await shot('sign-in',page.locator('.auth-form'));
    await login('20250003');
    await top('booking-paused',730);
  }
  if (phase === 'instructor') {
    await login('STAFF1001');
    await top('instructor-overview',750);
    await navigate('My sessions');
    await page.locator('.booking-row').filter({hasText:'Solving simultaneous equations for branch currents'}).getByRole('button',{name:'View details',exact:true}).click();
    await shot('instructor-details',dialog());
    await button('Record feedback').click();
    await page.getByRole('textbox',{name:'Feedback for the student',exact:true}).fill('Your equations describe the circuit correctly. Next, check the sign of each current against the direction chosen in your diagram.');
    await page.getByRole('textbox',{name:'Feedback for the student',exact:true}).blur();
    await shot('record-feedback',dialog());
    await button('Complete & save feedback').click();
    await dialog().waitFor({state:'hidden'});
  }
  if (phase === 'admin') {
    await login('STAFF0001');
    await navigate('All meetings');
    {
      const start=await main().boundingBox();
      const end=await page.locator('.booking-row').nth(2).boundingBox();
      await page.screenshot({path:assets+'admin-meetings.png',clip:{x:start.x,y:start.y,width:start.width,height:end.y+end.height-start.y},animations:'disabled'});
    }
    await navigate('People & rosters');
    await throughRows('people-rosters',main(),2);
    await shot('roster-pagination',page.locator('.people-pagination'));
    await page.locator('input[type=file]').setInputFiles(assets+'roster-example.csv');
    await shot('roster-import',dialog());
    await close();
    await button('Issue account').click();
    await shot('issue-account',dialog());
    await close();
    await page.getByRole('button',{name:/^Booking paused/}).click();
    await page.getByRole('textbox',{name:'Search accounts',exact:true}).fill('2025');
    await page.getByRole('checkbox',{name:'Select 20250003',exact:true}).check();
    await page.getByRole('combobox',{name:'Bulk action',exact:true}).click();
    await page.getByRole('option',{name:'Lift booking pause',exact:true}).click();
    await shot('paused-accounts',page.locator('.users-panel'));
  }
  if (phase === 'schedule') {
    await login('STAFF0001');
    await navigate('Availability');
    await shot('availability-calendar',page.getByRole('region',{name:'Availability calendar',exact:true}));
    await button('Add teaching window').click();
    await page.setViewportSize({width:1280,height:1500});
    await page.getByRole('combobox',{name:'Weekday',exact:true}).click();
    await page.getByRole('option',{name:'Tuesday',exact:true}).click();
    await page.getByRole('spinbutton',{name:'Starting teaching week',exact:true}).fill('5');
    await page.getByRole('spinbutton',{name:'Students per slot',exact:true}).fill('2');
    await page.getByRole('combobox',{name:'Choose a classroom',exact:true}).click();
    await page.getByRole('option',{name:'Engineering Building · Room 302',exact:true}).click();
    await page.getByLabel('Starts at',{exact:true}).fill('18:30');
    await page.getByLabel('Ends at',{exact:true}).fill('20:05');
    await page.getByRole('checkbox',{name:/STAFF1001/}).check();
    await page.getByRole('checkbox',{name:/STAFF1002/}).check();
    await shot('teaching-window',dialog());
    await close();
    await page.setViewportSize({width:1280,height:1100});
    await page.getByRole('button',{name:/^Tuesday, 6 October 2026/}).click();
    await shot('individual-slots',page.locator('section').filter({has:page.getByRole('heading',{name:'Individual time slots',exact:true})}));
    await page.locator('summary').filter({hasText:'Weekly teaching windows'}).click();
    const timetable = page.locator('section').filter({has:page.getByRole('heading',{name:'Import weekly timetable',exact:true})});
    await timetable.locator('input[type=file]').setInputFiles(assets+'timetable-example.csv');
    await shot('timetable-import',timetable);
    await button('All semester sessions').click();
    await page.getByLabel('From date',{exact:true}).fill('2026-10-06');
    await page.getByLabel('To date',{exact:true}).fill('2026-10-06');
    await page.getByRole('button',{name:'Select all 6 matching sessions',exact:true}).click();
    await throughRows('semester-sessions',page.locator('.semester-sessions'),3);
    await button('Review removal').click();
    await shot('remove-sessions',dialog());
    await close();
  }
  const card = name => page.locator('section.records-panel').filter({has:page.getByRole('heading',{name})});
  // Crop from the top of one element to the bottom of another, wherever they sit on the page.
  const span = async (path, from, to, below=0) => {
    const a = await from.boundingBox(), b = await to.boundingBox();
    const y = await page.evaluate(() => window.scrollY);
    await page.screenshot({path,fullPage:true,clip:{x:a.x,y:a.y+y,width:a.width,height:b.y+b.height-a.y+below},animations:'disabled'});
  };
  if (phase === 'records') {
    await login('20260005');
    await navigate('My profile');
    await card(/^Learning profile/).getByText('Marks over time',{exact:true}).waitFor();
    await shot('student-learning-profile',card(/^Learning profile/));
    await shot('student-appointment-history',card(/^Appointment history/));
    await login('STAFF1002');
    await navigate('My profile');
    await span(assets+'teacher-approval-history.png',card(/^Approval history/),card(/^Approval history/).locator('tbody tr').nth(4));
    await span(assets+'teacher-guidance-history.png',card(/^Guidance history/),card(/^Guidance history/).locator('tbody tr').nth(4));
    await login('STAFF0001');
    await navigate('Statistics');
    await page.locator('.statistics-breakdown').waitFor();
    await span(assets+'statistics-overview.png',main(),page.locator('.statistics-breakdown'),20);
    const tables = page.locator('section.records-panel').filter({has:page.getByRole('tablist')});
    await span(assets+'statistics-students.png',tables,tables.locator('tbody tr').nth(4));
    await page.getByRole('tab',{name:/^Teachers/}).click();
    await page.getByRole('heading',{name:'Teacher records',exact:true}).waitFor();
    await shot('statistics-teachers',tables);
    await page.getByRole('button',{name:'Open records for STAFF1002',exact:true}).click();
    await page.getByRole('heading',{name:'Teacher records.',exact:true}).waitFor();
    await span(assets+'statistics-teacher-records.png',main(),card(/^Approval history/).locator('.record-figures'));
    await button('Back to statistics').click();
    await page.getByRole('tab',{name:/^Students/}).click();
    await page.getByRole('button',{name:'Open records for 20260005',exact:true}).click();
    await page.getByRole('heading',{name:'Student records.',exact:true}).waitFor();
    await span(assets+'statistics-student-records.png',main(),card(/^Learning profile/),20);
    await button('Back to statistics').click();
  }
  // Supplementary checks of the records views: interactions, Chinese, dark theme, phone width and empty states.
  if (phase === 'records-qa') {
    const extra = root + '/output/screenshots/records-statistics/';
    const full = name => page.screenshot({path:extra+name+'.png',fullPage:true,animations:'disabled'});
    const expectRows = async (panel, count, what) => {
      const found = await panel.locator('tbody tr').count();
      if (found !== count) throw new Error(`${what}: expected ${count} rows, found ${found}.`);
    };
    const phone = async () => {
      await page.setViewportSize({width:390,height:844});
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0,0));
    };
    const fits = async what => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) throw new Error(`${what}: the page scrolls sideways by ${overflow}px.`);
    };
    await login('20260005');
    await navigate('My profile');
    const history = card(/^Appointment history/);
    await expectRows(history,6,'Student history');
    await history.getByRole('button',{name:/^Absent/}).click();
    await expectRows(history,1,'Absent filter');
    await history.getByRole('button',{name:/^View the tutorial on 17 Sept 2026/}).click();
    await dialog().getByText('No attendance recorded for this tutorial.',{exact:true}).waitFor();
    await page.screenshot({path:extra+'student-history-details.png',animations:'disabled'});
    await close();
    await card(/^Learning profile/).locator('.mark-trend-plot button').first().hover();
    await page.locator('[data-slot="tooltip-content"]').waitFor();
    await page.screenshot({path:extra+'student-mark-tooltip.png',animations:'disabled'});
    await phone();
    await fits('Student profile at phone width');
    await full('student-profile-phone');
    await page.setViewportSize({width:1280,height:1100});
    await login('20260020');
    await navigate('My profile');
    await card(/^Learning profile/).getByText('No appointments yet',{exact:true}).waitFor();
    await span(extra+'student-records-empty.png',card(/^Learning profile/),card(/^Appointment history/));
    await login('STAFF1002');
    await navigate('My profile');
    const approvals = card(/^Approval history/), guidance = card(/^Guidance history/);
    await approvals.getByRole('button',{name:/^Approved by you/}).click();
    await expectRows(approvals,1,'Approved by you filter');
    await approvals.getByRole('button',{name:/^Awaiting approval/}).click();
    await expectRows(approvals,1,'Awaiting approval filter');
    await approvals.getByRole('button',{name:/^View the tutorial on 8 Oct 2026/}).click();
    await dialog().getByRole('button',{name:'Approve',exact:true}).waitFor();
    await page.screenshot({path:extra+'teacher-pending-approval-details.png',animations:'disabled'});
    await close();
    await approvals.getByRole('button',{name:/^All/}).click();
    await approvals.getByRole('button',{name:'Page 2',exact:true}).click();
    await approvals.getByText(/21 records · Page 2 of 3/).waitFor();
    await guidance.getByRole('button',{name:/^Awaiting feedback/}).click();
    await expectRows(guidance,1,'Awaiting feedback filter');
    await page.getByRole('combobox',{name:'Theme',exact:true}).click();
    await page.getByRole('option',{name:'Dark',exact:true}).click();
    await page.evaluate(() => window.scrollTo(0,0));
    await full('teacher-profile-dark');
    await phone();
    await fits('Teacher profile at phone width');
    await full('teacher-profile-dark-phone');
    await page.setViewportSize({width:1280,height:1100});
    await page.getByRole('combobox',{name:'Theme',exact:true}).click();
    await page.getByRole('option',{name:'Light',exact:true}).click();
    await login('STAFF0001');
    await navigate('Statistics');
    await page.locator('.statistics-breakdown').waitFor();
    await page.getByRole('textbox',{name:'Search students',exact:true}).fill('26智H一');
    const tables = page.locator('section.records-panel').filter({has:page.getByRole('tablist')});
    await expectRows(tables,1,'Student search by class');
    await page.getByRole('textbox',{name:'Search students',exact:true}).fill('');
    await tables.getByRole('button',{name:/^All students/}).click();
    await tables.getByText(/64 records · Page 1 of 2/).waitFor();
    await button('Switch to Chinese').click();
    await page.getByRole('heading',{name:'每一次辅导，都有记录。',exact:true}).waitFor();
    await full('statistics-chinese');
    await page.getByRole('combobox',{name:'主题',exact:true}).click();
    await page.getByRole('option',{name:'深色',exact:true}).click();
    await full('statistics-chinese-dark');
    await page.getByRole('tab',{name:/^教师/}).click();
    await page.getByRole('button',{name:'打开 STAFF1002 的档案',exact:true}).click();
    await page.getByRole('heading',{name:'教师档案。',exact:true}).waitFor();
    await full('teacher-records-chinese-dark');
    await page.getByRole('button',{name:'返回数据统计',exact:true}).click();
    await page.getByRole('tab',{name:/^学生/}).click();
    await page.getByRole('textbox',{name:'搜索学生',exact:true}).fill('20260005');
    await page.getByRole('button',{name:'打开 20260005 的档案',exact:true}).click();
    await page.getByRole('heading',{name:'学生档案。',exact:true}).waitFor();
    await page.getByRole('combobox',{name:'主题',exact:true}).click();
    await page.getByRole('option',{name:'浅色',exact:true}).click();
    await full('student-records-chinese');
    await phone();
    await page.getByRole('button',{name:'返回数据统计',exact:true}).click();
    await page.evaluate(() => window.scrollTo(0,0));
    await fits('Statistics at phone width');
    await full('statistics-chinese-phone');
    await page.setViewportSize({width:1280,height:1100});
    await button('切换至英文').click();
    await page.getByRole('heading',{name:'Every tutorial, in numbers.',exact:true}).waitFor();
    await login('STAFF1002');
    await navigate('My profile');
    await approvals.getByRole('button',{name:/^View the tutorial on 8 Oct 2026/}).click();
    await dialog().getByRole('button',{name:'Approve',exact:true}).click();
    await dialog().waitFor({state:'hidden'});
    await approvals.getByRole('button',{name:'Approved by you 2',exact:true}).waitFor();
    await approvals.getByRole('button',{name:'Awaiting approval 0',exact:true}).waitFor();
    await approvals.getByRole('button',{name:'Approved by you 2',exact:true}).click();
    await expectRows(approvals,2,'Approved by you after approving');
    await span(extra+'teacher-after-approval.png',approvals,approvals.locator('tbody tr').nth(1),24);
    await login('20260005');
    await navigate('My profile');
    await history.locator('tbody tr').first().getByText('Approved by Emma Zhou',{exact:true}).waitFor();
    await history.screenshot({path:extra+'student-after-approval.png',animations:'disabled'});
    await login('STAFF0001');
    await navigate('Statistics');
    await page.locator('.statistics-breakdown').getByText('Approved by staff',{exact:true}).waitFor();
    const staffApproved = await page.locator('.record-bars li').filter({hasText:'Approved by staff'}).locator('.record-bar-value').innerText();
    if (!staffApproved.startsWith('3')) throw new Error(`Statistics should count three staff approvals, found ${staffApproved}.`);
    await span(extra+'statistics-after-approval.png',main(),page.locator('.statistics-breakdown'),20);
  }
}
