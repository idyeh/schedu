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
}
