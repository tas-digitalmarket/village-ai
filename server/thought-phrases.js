function parseMinutes(time) {
  const [h = 0, m = 0] = String(time || '06:00').split(':').map(Number);
  return h * 60 + m;
}

function pick(seedParts, list) {
  const seed = String(seedParts.filter(Boolean).join('|'));
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return list[hash % list.length];
}

const ACTION_WORDS = {
  eating: 'غذا خوردن',
  sleeping: 'خوابیدن',
  sitting: 'استراحت',
  resting: 'استراحت',
  watering_crops: 'آبیاری مزرعه',
  watering_garden: 'آبیاری باغچه',
  harvesting: 'برداشت محصول',
  chopping_wood: 'جمع کردن هیزم',
  tending_crops: 'رسیدگی به محصول‌ها',
  tending_animals: 'رسیدگی به حیوانات',
  animal_care: 'مراقبت از حیوانات',
  checking_motorcycle: 'بررسی موتور',
  morning_garden: 'رسیدگی صبحگاهی به باغچه',
  checking_herbs: 'مرتب کردن گیاه‌ها',
  village_errand: 'رفتن به مرکز روستا',
  evening_prayer: 'دعای عصر',
  shared_path_garden: 'کار کنار مسیر مشترک',
  wandering: 'قدم زدن در مزرعه',
  walking: 'راه رفتن',
  fishing: 'ماهیگیری',
  running_to_shelter: 'برگشتن به سرپناه'
};

function actionWord(action, label) {
  return ACTION_WORDS[action] || label || action || 'کارم';
}

function buildTaskThought(characterName, task = {}, worldTime = '06:00', day = 1) {
  const isAida = characterName === 'aida';
  const actor = isAida ? 'من' : 'من';
  const work = actionWord(task.action, task.label);
  const place = task.location || (isAida ? 'خانه‌ام' : 'مزرعه');
  const reason = task.reason ? ` چون ${task.reason}` : '';
  const source = task.source || 'routine';
  const lines = {
    creator: [
      `${actor} حرف خالق را شنیدم؛ الان ${work} را انجام می‌دهم.`,
      `این یکی دستور خالق است. می‌روم سراغ ${work}.`,
      `باشه، الان وقت ${work} است و انجامش می‌دهم.`
    ],
    risk: [
      `الان باید حواسم به ${work} باشد${reason}.`,
      `اول باید این خطر را جمع کنم؛ ${work} مهم‌تر است.`,
      `اگر الان به ${work} نرسم، بعداً سخت‌تر می‌شود.`
    ],
    need: [
      `بدنم و خانه این را لازم دارد؛ می‌روم سراغ ${work}.`,
      `${work} الان از بقیه کارها ضروری‌تر است.`,
      `بهتر است اول ${work} را انجام بدهم تا روز از دستم نرود.`
    ],
    goal: [
      `برای هدف امروز، نوبت ${work} است.`,
      `این کار کمک می‌کند روزم جلو برود؛ ${work} را شروع می‌کنم.`,
      `قدم بعدی روشن است: ${work}.`
    ],
    planner: [
      `برنامه امروز من را به ${work} رسانده است.`,
      `طبق برنامه، الان باید ${work} را جلو ببرم.`,
      `این مرحله از برنامه است؛ می‌روم سمت ${place}.`
    ],
    life_brain: [
      `با حال و هوای الان، ${work} طبیعی‌ترین کار است.`,
      `کمی نگاه کردم؛ بهتر است الان ${work} را انتخاب کنم.`,
      `این لحظه بیشتر به ${work} می‌خورد تا کارهای دیگر.`
    ],
    tempo: [
      `کار قبلی تمام شد؛ چند دقیقه نفسم را تازه می‌کنم.`,
      `قبل از کار بعدی کمی آرام می‌مانم.`,
      `الان فقط لازم است بدنم را آرام کنم.`
    ],
    routine: [
      `طبق روال روز، وقت ${work} رسیده است.`,
      `روز روستایی همین نظم را می‌خواهد؛ الان ${work}.`,
      `نوبت ${work} است و باید آرام شروعش کنم.`
    ]
  };
  return pick([characterName, day, worldTime, task.action, source, task.location], lines[source] || lines.routine);
}

function buildCompletionThought(characterName, label, success = true, worldTime = '06:00', day = 1) {
  const name = characterName === 'aida' ? 'Aida' : 'Arash';
  const work = label || 'کار';
  const ok = [
    `${work} تمام شد؛ حالا اثرش را در زندگی روزم حس می‌کنم.`,
    `${work} را جمع کردم. یک کار از روی دوشم برداشته شد.`,
    `کار ${work} به پایان رسید؛ حالا می‌توانم ببینم قدم بعدی چیست.`
  ];
  const fail = [
    `${work} کامل پیش نرفت؛ بعداً باید دوباره به آن برگردم.`,
    `برای ${work} شرایط کامل نبود. فعلاً رهایش می‌کنم تا فرصت بهتر برسد.`,
    `${work} آن‌طور که می‌خواستم تمام نشد؛ یادم می‌ماند دوباره سراغش بروم.`
  ];
  return pick([name, day, worldTime, work, success ? 'ok' : 'fail'], success ? ok : fail);
}

function buildSocialDialogue(arashState = {}, aidaState = {}, worldTime = '06:00') {
  const minute = parseMinutes(worldTime);
  const arashAction = actionWord(arashState.current_action, arashState.active_task_label);
  const aidaAction = actionWord(aidaState.current_action, aidaState.active_task_label);
  const shared = aidaState.current_action === 'shared_path_garden' || (minute >= 17 * 60 && minute < 18 * 60 + 30);
  const night = minute >= 22 * 60 || minute < 6 * 60;
  const morning = minute >= 7 * 60 && minute < 9 * 60;
  const key = [worldTime, arashState.current_action, aidaState.current_action, arashState.day || aidaState.day || 1];

  if (night) {
    return pick(key, [
      [
        { speaker: 'arash', text: 'شب شده؛ بهتر است توانم را برای صبح نگه دارم.' },
        { speaker: 'aida', text: 'من هم خانه‌ام را آرام می‌کنم؛ فردا باغچه کار دارد.' }
      ],
      [
        { speaker: 'arash', text: 'امشب روستا ساکت‌تر است. وقت خواب است.' },
        { speaker: 'aida', text: 'آره، حیوانات هم آرام شده‌اند. من هم استراحت می‌کنم.' }
      ]
    ]);
  }
  if (shared) {
    return pick(key, [
      [
        { speaker: 'arash', text: 'اگر این مسیر مرتب بماند، رفت‌وآمد بین خانه‌ها راحت‌تر می‌شود.' },
        { speaker: 'aida', text: 'من کنار راه چند بوته می‌کارم تا اینجا زنده‌تر شود.' }
      ],
      [
        { speaker: 'arash', text: 'خوب است این بخش را با هم آرام‌آرام درست کنیم.' },
        { speaker: 'aida', text: 'من هم موافقم؛ هم مسیر بهتر می‌شود، هم باغچه جان می‌گیرد.' }
      ]
    ]);
  }
  if (morning) {
    return pick(key, [
      [
        { speaker: 'arash', text: `صبح را با ${arashAction} شروع کرده‌ام.` },
        { speaker: 'aida', text: `من هم اول به ${aidaAction} می‌رسم؛ صبح وقت خوبی برای کارهای ظریف است.` }
      ],
      [
        { speaker: 'arash', text: 'صبح زود مزرعه آدم را بهتر راه می‌اندازد.' },
        { speaker: 'aida', text: 'برای من هم باغچه صبح‌ها زنده‌تر است.' }
      ]
    ]);
  }
  return pick(key, [
    [
      { speaker: 'arash', text: `فعلاً مشغول ${arashAction} هستم.` },
      { speaker: 'aida', text: `من هم دارم ${aidaAction} را جلو می‌برم.` }
    ],
    [
      { speaker: 'arash', text: 'هر کداممان یک گوشه از روز را نگه داشته‌ایم.' },
      { speaker: 'aida', text: 'همین آرام‌آرام روستا را زنده‌تر می‌کند.' }
    ],
    [
      { speaker: 'arash', text: `من حواسم به ${arashAction} است.` },
      { speaker: 'aida', text: `من هم نزدیک خانه‌ام به ${aidaAction} می‌رسم.` }
    ]
  ]);
}

module.exports = { buildTaskThought, buildCompletionThought, buildSocialDialogue };
