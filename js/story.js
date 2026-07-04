/* SECOND HAND — the stranger generator: arcs, occupations, motion, weather, epilogues.
   Everything about the owner is derived from one seed. The pocket narrates. */
(function () {
  'use strict';
  const SH = window.SH;
  const { pick, ri, rf } = SH;

  const DAYNAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAYWORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];

  const WEATHER = [
    { id: 'rain',  word: 'rain.',            light: 0.7,  sway: 1.15 },
    { id: 'clear', word: 'thin sunshine.',   light: 1.1,  sway: 1.0 },
    { id: 'cold',  word: 'proper cold.',     light: 0.85, sway: 0.9 },
    { id: 'wind',  word: 'a bullying wind.', light: 0.9,  sway: 1.3 },
    { id: 'grey',  word: 'flat grey.',       light: 0.75, sway: 1.0 },
    { id: 'fog',   word: 'fog until noon.',  light: 0.6,  sway: 0.95 },
    { id: 'storm', word: 'a loud sky.',      light: 0.55, sway: 1.35 },
  ];

  const MOTIONS = [
    { id: 'fidgety', label: 'never quite still',                    sway: 1.25, jolt: 1.3,  speed: 1.1 },
    { id: 'calm',    label: 'moves like slow water',                sway: 0.8,  jolt: 0.75, speed: 0.9 },
    { id: 'heavy',   label: 'walks heavy, like they are sorry',     sway: 1.0,  jolt: 1.5,  speed: 0.85 },
    { id: 'quick',   label: 'always six minutes late',              sway: 1.1,  jolt: 1.1,  speed: 1.3 },
    { id: 'tired',   label: 'tired legs, tired week',               sway: 0.9,  jolt: 0.9,  speed: 0.8 },
  ];

  const OCCUPATIONS = [
    { id: 'office',    sched: 'office',    filler: ['receipt', 'pencap'],   line: 'their days are shaped like desks.' },
    { id: 'barista',   sched: 'barista',   filler: ['sachet', 'receipt'],   line: 'they smell of coffee and steamed milk by nine.' },
    { id: 'courier',   sched: 'courier',   filler: ['receipt', 'coin'],     line: 'they cross the whole city twice a day, fast.' },
    { id: 'student',   sched: 'student',   filler: ['eraser', 'usb'],       line: 'everything is due thursday. everything.' },
    { id: 'bartender', sched: 'bartender', filler: ['bottlecap', 'napkin'], line: 'they come home when the birds start singing.' },
    { id: 'gardener',  sched: 'gardener',  filler: ['seedpacket', 'twine'], line: 'there is always soil in my seams. i have stopped minding.' },
    { id: 'nurse',     sched: 'nurse',     filler: ['pencap', 'gum'],       line: 'they work all night caring for people, and sleep while the world is loud.' },
  ];

  const NEW_OWNERS = [
    'a night-shift cleaner who liked the colour',
    'a drummer who needed something warm for the walk home',
    'a retired postman who reads found receipts like little stories',
    'a student who swears the coat smells like luck',
    'a woman who just moved cities with one suitcase',
    'a tall kid starting their first job on monday',
    'a dog-walker with cold wrists and a good laugh',
    'an old man who buys a coat every ten years, needed or not',
  ];

  const STREETS = ['maple', 'harrow', 'birch', 'foundry', 'chapel', 'penny lane', 'old mill'];

  /* ---- lines for ordinary survivors, found by the new owner ---- */
  const FOUND = {
    coin:       ['exact bus fare, on a morning it really mattered.'],
    key:        ['a key to a door that may not exist anymore. they keep it anyway. everyone does.'],
    receipt:    ['one coffee, ages ago. the postman was right: receipts are little stories.'],
    gum:        ['still minty. bravely, they chew it.'],
    earbuds:    ['hopelessly tangled. some knots outlive their owners.'],
    photo:      ['two people on a wall, squinting at the sun. it goes on a fridge, strangers and all.'],
    napkin:     ['a phone number in fading ink. they think about it for a week. then, one brave tuesday—'],
    pick:       ['a guitar pick worn smooth. they don’t play. they start.'],
    stamps:     ['stamps! real stamps. someone gets a real letter this year.'],
    ticket:     ['an old one-way ticket. they frame it, as a dare to themselves.'],
    busticket:  ['a bus ticket to the corner where the singing used to be.'],
    lighter:    ['a lighter, low on fuel. birthday candles only, from now on.'],
    treat:      ['a cat treat. the new owner does not have a cat. a cat, sensing this, is already on its way.'],
    bottlecap:  ['a bottle cap from a good night. somehow, they can tell.'],
    seedpacket: ['half a packet of marigold seeds. the window box says thank you.'],
    sachet:     ['brown sugar, a bit stuck together. it goes into a monday coffee.'],
    eraser:     ['an eraser worn round. mistakes were made, then rubbed out.'],
    usb:        ['a usb stick. it holds either nothing or everything; they never check.'],
    pencap:     ['a pen cap, chewed thoughtfully. the pen is long gone. the thoughts remain.'],
    cigpack:    ['an empty cigarette packet, crushed on purpose. a trophy, actually.'],
    ringbox:    ['a small empty box shaped like a question.'],
    note:       ['a note that says “milk, bulbs, call m.” all three, they decide, still apply.'],
    twine:      ['a piece of green string. it will hold something up. it always does.'],
    ring:       ['a ring. see below.'],
    tag:        ['a collar tag. see below.'],
    letter:     ['a letter. see below.'],
  };

  /* =======================================================================
     ARCS — seven days each. drops/hands use f = fraction of the day.
     ======================================================================= */

  const ARCS = [];

  /* ---------------- THE RING ---------------- */
  ARCS.push({
    id: 'ring',
    keyType: 'ring',
    days: [
      { lines: g => [
          'the new-coat smell is long gone. this coat and i are old friends.',
          'today: two coins, and a receipt for one coffee. one coffee. remember that.',
          g.occ.line],
        drops: [{ f: .18, type: 'coin' }, { f: .3, type: 'coin' }, { f: .55, type: 'receipt' }] },
      { lines: () => [
          'they hummed today. humming travels down the seams like warm water.',
          'a napkin came in, folded twice, with a phone number on it — one they already know by heart.',
          'someone they love, i think. the kind of love where you keep the paper anyway.'],
        drops: [{ f: .4, type: 'napkin' }, { f: .7, type: 'coin' }] },
      { lines: () => [
          'the pacing started after lunch. four hundred steps over the same eight metres.',
          'and then — something small and heavy dropped in. it has its own box.',
          'i have carried keys and coins all my life. i have never carried a question before.'],
        drops: [{ f: .35, type: 'ringbox' }],
        hands: [{ f: .6, seek: 'ringbox', action: 'peek' }, { f: .85, seek: 'ringbox', action: 'peek' }],
        mods: { pace: 1 } },
      { lines: () => [
          'quieter today. the box stayed shut, and so did they.',
          'they practised words under their breath. i could feel them through the lining.'],
        drops: [{ f: .5, type: 'gum' }],
        hands: [{ f: .65, seek: 'ringbox', action: 'peek' }] },
      { lines: () => [
          'the box went away this morning. the small heavy thing came back alone.',
          'loose. rolling around. i don’t like how it rolls.',
          'if you ever wanted to be useful, little pocket, be useful now.'],
        hands: [
          { f: .2, seek: 'ringbox', action: 'take', flag: 'boxGone' },
          { f: .45, seek: 'ring', action: 'give' }],
        mods: { pace: 1 } },
      g => ({
        lines: (g.flags.ringLost)
          ? ['today was meant to be the day. they dressed carefully — i could tell by the ironing.',
             'the fingers came down for the ring and found only lint and old bus money.',
             'i have never felt a person go so quiet from the inside.']
          : ['today is the day. they dressed carefully — i could tell by the ironing.',
             'tonight, the fingers will come for the small heavy thing. keep it where they can find it.',
             'or don’t. i’m a pocket, not a judge.'],
        hands: [{ f: .78, seek: 'ring', action: 'take', flag: 'ringTaken', missFlag: 'ringMissed' }],
        mods: { dressed: 1 } }),
      g => {
        if (g.flags.ringTaken) return {
          lines: ['they came home at 4am smelling of rain and someone else’s perfume.',
                  'their steps were dancing. even the lint is celebrating.',
                  'i hear i’m being donated. new life, thinner coat. i understand completely.'],
          drops: [{ f: .3, type: 'coin' }, { f: .5, type: 'bottlecap' }],
          mods: { joy: 1 } };
        return {
          lines: ['they searched me four times today. i gave them everything i had. it was not the thing.',
                  'tonight they asked the question anyway, with empty hands held open.',
                  'i’m told it worked. people are stranger than pockets.'],
          hands: [{ f: .2, seek: 'ring', action: 'take', flag: 'ringTaken', missFlag: 'ringMissed2' },
                  { f: .5, seek: 'coin', action: 'take' }],
          mods: { frantic: 1 } };
      },
    ],
    outcome: g => {
      const f = g.fateOf('ring');
      if (g.flags.ringTaken)
        return ['the question got asked. i wasn’t there for the answer —',
                'but the coat came home dancing, and that is answer enough.'];
      if (f === 'lost')
        return ['somewhere on ' + g.street + ' street, a gold ring sits in a drain,',
                'waiting to be someone’s luckiest morning. the question got asked anyway, with open hands. it worked.'];
      if (f === 'in-pocket')
        return ['the new owner finds a ring at the bottom of me.',
                'they will wonder about it for years. it fits.'];
      return ['the ring went where rings go. the question found its own way out.'];
    },
  });

  /* ---------------- THE LETTER ---------------- */
  ARCS.push({
    id: 'letter',
    keyType: 'letter',
    days: [
      { lines: g => [
          'a letter today. folded four times, soft at the folds.',
          'it has been carried around a long time. carried letters are the unfinished kind.',
          g.occ.line],
        drops: [{ f: .3, type: 'letter' }, { f: .6, type: 'coin' }] },
      { lines: () => [
          'stamps. two of them, bought one at a time — the way you buy things you might chicken out of using.',
          'the letter got heavier overnight. that is not how physics works. i checked.'],
        drops: [{ f: .45, type: 'stamps' }],
        hands: [{ f: .7, seek: 'letter', action: 'peek' }] },
      { lines: () => [
          'we stood in front of the postbox for eleven minutes today.',
          'the fingers held the letter right at my opening. the wind came in.',
          'then the letter came back down. hello again, old friend.'],
        hands: [{ f: .5, seek: 'letter', action: 'peeklong' }],
        mods: { pace: 1 } },
      { lines: g => [
          g.weatherWord === 'rain.' ? 'rain got into everything today. i kept the letter dry. it’s what i’m for.'
                                    : 'a long day of small errands. the letter came along for all of them.',
          'i can feel one word through the paper, pressed harder than the rest. it says “sorry”.'],
        drops: [{ f: .5, type: 'gum' }] },
      { lines: () => [
          'they walked to the postbox again — faster this time, before the doubt could catch up.',
          'the fingers are coming for the letter. this is the moment, little pocket.',
          'let it go up, or keep it safe down here in the dark. both are a kind of caring.'],
        hands: [{ f: .55, seek: 'letter', action: 'take', flag: 'letterMailed', missFlag: 'letterKept' }],
        mods: { pace: 1 } },
      g => ({
        lines: g.flags.letterMailed
          ? ['so light today. lighter than this coat has felt in months.',
             'they bought a pastry and ate it walking. that is how happiness travels.']
          : ['the letter is still with us. they think they lost it — or they let themselves think that.',
             'their steps were heavy but honest. some words need longer in the dark.'],
        drops: [{ f: .4, type: 'coin' }, { f: .65, type: 'receipt' }] }),
      g => ({
        lines: g.flags.letterMailed
          ? ['an old photograph came in today: two people on a wall, squinting.',
             'it has been in a drawer a long time. it wanted some air. things are moving.',
             'i’m being donated. the coat from before. fair enough.']
          : ['they wrote a second letter tonight — i heard the pen through the lining.',
             'maybe that one gets further. maybe it says the word out loud.',
             'i’m being donated tomorrow. whatever i still hold, i hold.'],
        drops: g.flags.letterMailed ? [{ f: .4, type: 'photo' }] : [] }),
    ],
    outcome: g => {
      const f = g.fateOf('letter');
      if (g.flags.letterMailed)
        return ['three weeks later, a reply crossed the city in a red envelope.',
                'some doors only need one knock.'];
      if (f === 'in-pocket')
        return ['the new owner finds the letter and reads it. it isn’t theirs,',
                'but they cry anyway. then they post it. it still has the stamps.'];
      if (f === 'lost')
        return ['the rain got the letter in the end. the words are in the gutter, unread.',
                'say things out loud, while you can.'];
      return ['the letter went back into a drawer somewhere, waiting for a braver year.'];
    },
  });

  /* ---------------- THE LIGHTER ---------------- */
  ARCS.push({
    id: 'lighter',
    keyType: 'lighter',
    days: [
      { lines: g => [
          'a cigarette packet came in today, crushed on purpose. a promise.',
          'and the lighter. still here. promises are complicated.',
          g.occ.line],
        drops: [{ f: .25, type: 'cigpack' }, { f: .4, type: 'lighter' }] },
      { lines: () => [
          'gum. so much gum. there are new rules in here, clearly.',
          'twice today the fingers came down, touched the lighter, and went away empty.',
          'i counted. counting is mostly what i do.'],
        drops: [{ f: .2, type: 'gum' }, { f: .6, type: 'gum' }],
        hands: [{ f: .45, seek: 'lighter', action: 'peek' }] },
      { lines: () => [
          'a bad day. i could tell from the jaw — clenching travels all the way down here.',
          'the fingers will come hunting tonight. hide the fire, or hand it over.',
          'i don’t judge. i just hold things. but you can hold things AWAY.'],
        drops: [{ f: .3, type: 'gum' }],
        hands: [{ f: .7, seek: 'lighter', action: 'take', flag: 'cave1', missFlag: 'resist1', returns: true }],
        mods: { pace: 1 } },
      g => ({
        lines: g.flags.cave1
          ? ['“just one,” they said. the lighter came back down warm.',
             'nobody smokes just one. but nobody quits in a straight line, either.']
          : ['the fingers came up with lint and gum. they laughed — actually laughed.',
             'the kind of laugh that is at yourself, and also a small victory parade.'],
        drops: [{ f: .5, type: 'gum' }] }),
      { lines: () => [
          'steadier today. they ran — actually ran — for no bus at all.',
          'running for no reason is the body celebrating something the mouth hasn’t said yet.'],
        drops: [{ f: .45, type: 'coin' }],
        mods: { runjoy: 1 } },
      { lines: () => [
          'the last hard night, i think. old friends, a loud bar, everyone smoking outside in the cold.',
          'the fingers will come once more, out of pure habit.',
          'whatever you’ve been doing with that lighter — do it once more.'],
        hands: [{ f: .65, seek: 'lighter', action: 'take', flag: 'cave2', missFlag: 'resist2', returns: true }],
        mods: { pace: 1 } },
      g => ({
        lines: (g.flags.resist1 && g.flags.resist2)
          ? ['a whole week. they told the mirror this morning; i heard it through the wool.',
             'the gum wrappers in me rustle like tiny applause.',
             'i’m being donated — a coat that doesn’t smell of smoke, for whoever comes next.']
          : ['not a straight line, this week. but the packet stayed crushed, and that counts.',
             'they bought a small cake for nobody’s birthday. progress tastes like that sometimes.',
             'i’m being donated. carry the news gently, whoever gets me.'],
        drops: [{ f: .5, type: 'receipt' }] }),
    ],
    outcome: g => {
      const f = g.fateOf('lighter');
      const resisted = (g.flags.resist1 ? 1 : 0) + (g.flags.resist2 ? 1 : 0);
      if (f === 'lost')
        return ['the lighter fell out somewhere on ' + g.street + ' street.',
                'they decided it was a sign. signs work, if you let them.'];
      if (resisted === 2)
        return ['on day thirty-one, someone buys them a small cake.',
                'the lighter, wherever it ended up, never came out again.'];
      return ['some fires take longer to put out. the gum helped. the pocket doesn’t judge.'];
    },
  });

  /* ---------------- THE PICK ---------------- */
  ARCS.push({
    id: 'pick',
    keyType: 'pick',
    days: [
      { lines: () => [
          'they sang on the corner of foundry street today, and the sky mostly stayed dry.',
          'coins rained in like slow applause. and the picks — the lucky one is the worn one.',
          'you’ll know it when you see it. it looks like it has already played a thousand songs.'],
        drops: [{ f: .15, type: 'pick', opts: { lucky: true } }, { f: .3, type: 'pick' }],
        mods: { perform: 1 } },
      { lines: () => [
          'a napkin came in, the writing pressed hard enough to feel: “call about friday.”',
          'they read it six times. i felt every unfold.',
          'friday, it turns out, is an audition. fridays usually are.'],
        drops: [{ f: .4, type: 'napkin' }],
        mods: { perform: 1 } },
      { lines: () => [
          'practice, practice, a bus ticket to the rehearsal room, more practice.',
          'the humming never stopped today. i know the song by heart now. it’s a good one.'],
        drops: [{ f: .3, type: 'busticket' }, { f: .6, type: 'coin' }] },
      { lines: () => [
          'rent day. the fingers came down twice and counted everything twice.',
          'coins left. the picks stayed. good priorities.'],
        hands: [{ f: .4, seek: 'coin', action: 'take' }, { f: .7, seek: 'coin', action: 'take' }],
        mods: { pace: 1 } },
      { lines: () => [
          'no singing today. saving the voice. the whole body walked carefully,',
          'like someone carrying a very full cup across a room.'],
        drops: [{ f: .5, type: 'gum' }] },
      { lines: () => [
          'friday. their hands were cold all day — i felt it every time they reached in.',
          'right before the door, they’ll reach for the lucky pick. the worn one.',
          'keep it easy to find. or don’t — that works too, but it’s louder.'],
        hands: [{ f: .6, seek: 'pick', action: 'take', flag: 'pickTaken', missFlag: 'pickMissed', wantLucky: true }],
        mods: { pace: 1 } },
      g => ({
        lines: g.flags.pickTaken
          ? ['they played it clean. i could hear it in the walk home: bouncy, swinging.',
             'starting monday, someone gets paid to sing.',
             'a warmer coat is coming, apparently. i regret nothing.']
          : ['the pick wasn’t there at the door. one breath. then a coin from the lining instead.',
             'they played with a coin, like the old blues players did. and it worked anyway.',
             'turns out the luck was never in the pick. still — keep it.'],
        drops: [{ f: .3, type: 'coin' }, { f: .5, type: 'coin' }],
        mods: { joy: 1 } }),
    ],
    outcome: g => {
      const f = g.fateOf('pick');
      if (g.flags.pickTaken)
        return ['the lucky pick did its old trick one more time.',
                'somewhere across town, a band is arguing about a name.'];
      if (f === 'lost')
        return ['the lucky pick is in a drain on ' + g.street + ' street, still lucky.',
                'the audition went fine with a coin. luck is a story musicians tell about themselves.'];
      if (f === 'in-pocket')
        return ['the new owner finds a worn pick and, eventually, a guitar to match it.',
                'luck, it turns out, can be handed down.'];
      return ['the pick moved on, the way picks do. the song stayed.'];
    },
  });

  /* ---------------- THE COLLAR TAG ---------------- */
  ARCS.push({
    id: 'collar',
    keyType: 'tag',
    days: [
      { lines: g => [
          'something followed them home last night. something small, loud, and very sure of itself.',
          'today a cat treat arrived in me. so you can guess how the negotiations are going.',
          g.occ.line],
        drops: [{ f: .4, type: 'treat' }] },
      { lines: () => [
          'two more treats. also fur. so much fur. it drifts down here like warm snow.',
          'and then — a collar tag. engraved. a phone number that is not theirs.',
          'ah. the small loud thing already belongs to somebody.'],
        drops: [{ f: .25, type: 'treat' }, { f: .55, type: 'tag' }, { f: .7, type: 'treat' }] },
      { lines: () => [
          'they held the tag up to the light twice today, and put it back twice.',
          'the cat, i’m told, sleeps on the good chair like it has always owned it.',
          'deciding things is mostly carrying them around first.'],
        hands: [{ f: .4, seek: 'tag', action: 'peek' }, { f: .75, seek: 'tag', action: 'peek' }],
        mods: { pace: 1 } },
      { lines: () => [
          'today they mean to call the number. the fingers will come for the tag.',
          'give it up, and the cat goes home to whoever misses it.',
          'hide it — or feed it to the hole — and the cat stays. i’m just a pocket. this one is yours too.'],
        hands: [{ f: .55, seek: 'tag', action: 'take', flag: 'tagCalled', missFlag: 'tagHidden' }] },
      g => ({
        lines: g.flags.tagCalled
          ? ['the call was short. the voice on the other end cried in the good way.',
             'the cat’s name, it turns out, is margot. she has been missed for two months.']
          : ['no call. the tag stayed lost, wherever you put it. and the cat stayed too.',
             'it has started sleeping on the coat. i can feel the purring from here. it’s excellent.'],
        drops: [{ f: .5, type: 'treat' }] }),
      g => ({
        lines: g.flags.tagCalled
          ? ['margot went home today. the flat is quieter than quiet.',
             'they walked the long way back, hands deep inside me the whole time.',
             'you can miss something you only had a week. hearts are huge. pockets know all the sizes.']
          : ['a new collar arrived — bought this time. no engraving yet.',
             'they keep trying out names. the cat has clearly already chosen its own.'],
        drops: g.flags.tagCalled ? [] : [{ f: .5, type: 'treat' }] }),
      g => ({
        lines: g.flags.tagCalled
          ? ['this morning they went to the shelter and came home with the loudest kitten in the building.',
             'a kitten needs a warmer coat than me to ride in. i’m being donated. good trade.']
          : ['the cat is called sunday now. today is its name-day, obviously.',
             'i’m being donated — apparently sunday sheds enough fur for two coats.',
             'whatever is left in me, i pass along with the fur. all of it. no take-backs.'],
        drops: [{ f: .4, type: 'treat' }] }),
    ],
    outcome: g => {
      const f = g.fateOf('tag');
      if (g.flags.tagCalled)
        return ['margot sleeps at home again, and a loud kitten runs the flat now.',
                'two houses, both warmer.'];
      if (f === 'lost')
        return ['the tag is under a hedge on ' + g.street + ' street.',
                'the cat stayed. some decisions get made by the holes in pockets.'];
      if (f === 'in-pocket')
        return ['the new owner finds the tag, and the number still answers.',
                'margot, it turns out, had been living two lives all along. cats contain multitudes.'];
      return ['the tag went wherever the fingers took it. the purring, either way, continues.'];
    },
  });

  /* ---------------- THE TICKET ---------------- */
  ARCS.push({
    id: 'ticket',
    keyType: 'ticket',
    days: [
      { lines: g => [
          'a train ticket came in today. one way. friday, 06:12.',
          'also the door key — which suddenly feels like a guest here, not a resident.',
          g.occ.line],
        drops: [{ f: .3, type: 'ticket' }, { f: .55, type: 'key' }] },
      { lines: () => [
          'an old photograph joined us: two people on a wall, squinting at the sun.',
          'the fingers held it a long time today. long enough for the light through the wool to move.'],
        drops: [{ f: .35, type: 'photo' }],
        hands: [{ f: .6, seek: 'photo', action: 'peeklong' }] },
      { lines: () => [
          'moving-boxes day. eleven boxes. i felt every single stair, twice.',
          'a whole life fits in eleven boxes and one pocket. i’m carrying the important half, obviously.'],
        drops: [{ f: .5, type: 'twine' }],
        mods: { heavy: 1 } },
      { lines: () => [
          'today the door key goes back to its owner. the fingers will come for it.',
          'a key is the hardest goodbye that fits in a fist.'],
        hands: [{ f: .5, seek: 'key', action: 'take', flag: 'keyReturned', missFlag: 'keyKept' }],
        mods: { pace: 1 } },
      { lines: () => [
          'they sat by the river for three hours. i watched the light change through the weave.',
          'the ticket got checked eleven times. it says the same thing every time. 06:12.'],
        hands: [{ f: .5, seek: 'ticket', action: 'peek' }] },
      { lines: () => [
          'last night in the old city. one slow walk past all the old places.',
          'tomorrow starts before the sun. the fingers will want the ticket — early, and fast.',
          'keep it near the top. or don’t, and buy them three more hours here. your call, little pocket.'],
        hands: [{ f: .7, seek: 'ticket', action: 'peek' }],
        mods: { pace: 1 } },
      g => ({
        lines: g.flags.ticketUsed
          ? []
          : ['dark morning. running. the whole world is a drum.',
             'the fingers are diving for the ticket NOW —'],
        hands: [{ f: .18, seek: 'ticket', action: 'take', flag: 'ticketUsed', missFlag: 'ticketMissed' }],
        mods: { sprint: 1 } }),
    ],
    outcome: g => {
      if (g.flags.ticketUsed)
        return ['the platform was cold. the new city is warmer.',
                'the coat, they decided, belongs to the old city. somewhere north, box eight of eleven is being unpacked.'];
      const f = g.fateOf('ticket');
      if (f === 'lost' || f === 'in-pocket')
        return ['they missed the 06:12. they caught the 09:40.',
                'nothing important changes by three hours — but you knew that, didn’t you.'];
      return ['the ticket got used, one way or another. one-way things always do.'];
    },
  });

  /* ---- simple, anonymous phrasings for suspects + the final answer ---- */
  const WORKP = {
    office:    'sits at a desk all week',
    barista:   'makes coffee for strangers all day',
    courier:   'races deliveries across the city',
    student:   'is a student drowning in deadlines',
    bartender: 'pours drinks until the birds sing',
    gardener:  'works with plants and soil',
    nurse:     'cares for people all through the night',
  };
  const MATTERP = {
    ring:    'is carrying a question they are scared to ask',
    letter:  'wrote something long ago and never sent it',
    lighter: 'is trying to give up smoking',
    pick:    'has one big chance to be heard',
    collar:  'found an animal that belongs to someone else',
    ticket:  'is about to leave the city for good',
  };
  const WALKP = {
    fidgety: 'is never quite still',
    calm:    'moves like slow water',
    heavy:   'walks heavy, like they are sorry about something',
    quick:   'is always six minutes late',
    tired:   'walks on tired legs',
  };
  SH.GUESSES = {
    work: OCCUPATIONS.map(o => ({ id: o.id, line: WORKP[o.id] })),
    matter: ARCS.map(a => ({ id: a.id, line: MATTERP[a.id] })),
  };

  /* =======================================================================
     GENERATOR
     ======================================================================= */
  SH.generateStranger = function (seed) {
    const r = SH.mulberry32(seed);
    const arc = pick(r, ARCS);
    const occ = pick(r, OCCUPATIONS);
    const motion = pick(r, MOTIONS);
    const startDay = ri(r, 0, 6);
    const weather = [];
    for (let i = 0; i < 7; i++) weather.push(pick(r, WEATHER));
    const g = {
      seed,
      seedId: SH.seedToId(seed),
      rng: r,
      arc, occ, motion, weather,
      newOwner: pick(r, NEW_OWNERS),
      street: pick(r, STREETS),
      dayNames: Array.from({ length: 7 }, (_, i) => DAYNAMES[(startDay + i) % 7]),
      flags: {},
      items: [],
      lostYesterday: 0,
      weatherWord: '',
      fateOf(type) {
        let best = 'none';
        for (const it of g.items) {
          if (it.type !== type) continue;
          if (it.fate === 'lost') return 'lost';
          if (it.fate === 'in-pocket') best = 'in-pocket';
          else if (best === 'none') best = it.fate;
        }
        return best;
      },
    };

    /* the suspect board: four possible people. one is real.
       one decoy is a TWIN — same job, same secret, different walk —
       so the items alone can never settle it. you have to watch them move. */
    const works = SH.shuffle(r, OCCUPATIONS.map(o => o.id).filter(id => id !== occ.id));
    const matters = SH.shuffle(r, ARCS.map(a => a.id).filter(id => id !== arc.id));
    const walks = SH.shuffle(r, MOTIONS.map(m => m.id).filter(id => id !== motion.id));
    const raw = [
      { work: occ.id,   matter: arc.id,     walk: motion.id, correct: true },
      { work: occ.id,   matter: arc.id,     walk: walks[0],  correct: false }, // the twin
      { work: works[0], matter: arc.id,     walk: motion.id, correct: false }, // wrong job
      { work: occ.id,   matter: matters[0], walk: walks[1],  correct: false }, // wrong secret
    ];
    const NAMES = ['person one', 'person two', 'person three', 'person four'];
    g.suspects = SH.shuffle(r, raw).map((s, i) => ({
      id: i, name: NAMES[i], work: s.work, matter: s.matter, walk: s.walk, correct: s.correct,
      occP: WORKP[s.work], matP: MATTERP[s.matter], walkP: WALKP[s.walk],
      blurb: 'someone who ' + WORKP[s.work] + ', who ' + MATTERP[s.matter] + ', and who ' + WALKP[s.walk] + '.',
    }));
    g.suspectPick = null;
    g.suspectStruck = {};
    return g;
  };

  /* resolve day N (0-based) into {header, lines, drops, hands, mods} */
  SH.resolveDay = function (g, n) {
    g.weatherWord = g.weather[n].word;
    let d = g.arc.days[n];
    if (typeof d === 'function') d = d(g);
    const lines = (typeof d.lines === 'function' ? d.lines(g) : d.lines || []).slice();
    if (n > 0 && g.lostYesterday > 0)
      lines.push('(the hole took ' + (g.lostYesterday === 1 ? 'something' : g.lostYesterday + ' things') +
                 ' yesterday. i felt ' + (g.lostYesterday === 1 ? 'it' : 'each one') + ' go.)');
    const drops = (d.drops || []).slice();
    const r = g.rng;
    const nCoins = ri(r, 0, 2);
    for (let i = 0; i < nCoins; i++) drops.push({ f: rf(r, .1, .9), type: 'coin' });
    if (r() < .5) drops.push({ f: rf(r, .15, .85), type: pick(r, g.occ.filler) });
    if (n === 1 && r() < .8) drops.push({ f: rf(r, .2, .8), type: 'earbuds' });
    drops.sort((a, b) => a.f - b.f);
    // everyday rummages: the fingers come counting bus money most days
    const hands = (d.hands || []).slice();
    if (r() < .65) hands.push({ f: rf(r, .15, .8), seek: 'coin', action: 'take', minor: true });
    hands.sort((a, b) => a.f - b.f);
    return {
      header: 'DAY ' + DAYWORDS[n] + ' — ' + g.dayNames[n] + '. ' + g.weather[n].word,
      lines,
      drops,
      hands,
      mods: d.mods || {},
    };
  };

  /* epilogue card sequence after day 7 — three different shapes, chosen by seed,
     so no two goodbyes read the same way */
  SH.buildEpilogue = function (g) {
    const cards = [];
    const shape = g.seed % 3;

    // shared pieces
    const kept = g.items.filter(it => it.fate === 'in-pocket' && it.type !== g.arc.keyType);
    const found = [];
    const seen = {};
    for (const it of kept) {
      if (seen[it.type]) continue;
      seen[it.type] = true;
      const l = FOUND[it.type];
      if (l && it.type !== 'ring' && it.type !== 'tag' && it.type !== 'letter') found.push(l[0]);
    }
    const foundCard = head => found.length
      ? { head, lines: found.slice(0, 6) }
      : { head, lines: ['nothing but lint and warmth.', 'which, on the right morning, is plenty.'] };
    const lost = g.items.filter(it => it.fate === 'lost');
    const holeCard = lost.length
      ? { head: 'AND THE HOLE',
          lines: ['the hole kept ' + lost.length + ' small thing' + (lost.length > 1 ? 's' : '') + ' for itself.',
                  'a drain on ' + g.street + ' street is secretly rich now.',
                  'some pockets are doors. i never said i wasn’t.'] }
      : null;

    if (shape === 0) {
      // the classic: the coat leaves, someone new arrives
      cards.push({ head: 'SUNDAY, LATER',
        lines: ['the coat goes into a paper bag, then a van,',
                'then onto a rail between a hundred sleeping coats.',
                'pockets dream, in case you wondered. we dream of weight.'] });
      cards.push({ head: 'SOMEONE NEW',
        lines: ['the coat is chosen by ' + g.newOwner + '.',
                'the first thing everyone does with a second-hand coat', 'is reach into the pockets.'] });
      cards.push(foundCard('WHAT THE POCKET GAVE THEM'));
      if (holeCard) cards.push(holeCard);
      cards.push({ head: 'AS FOR THEM', lines: g.arc.outcome(g) });
    } else if (shape === 1) {
      // verdict first: how it ended, then what was left behind
      cards.push({ head: 'HOW IT ENDED', lines: g.arc.outcome(g) });
      cards.push({ head: 'THE COAT MOVES ON',
        lines: ['a paper bag. a van. a rail of sleeping coats.',
                'a week is a long time to hold somebody’s life.', 'i was glad to do it.'] });
      if (holeCard) cards.push(holeCard);
      cards.push(foundCard('LEFT BEHIND, PASSED ALONG'));
      cards.push({ head: 'THE LAST POCKET FACT',
        lines: ['the coat is chosen by ' + g.newOwner + '.',
                'they will never know any of this.', 'unless the pocket tells them. pockets talk. look at me now.'] });
    } else {
      // told from the new owner's first morning
      cards.push({ head: 'A DIFFERENT MONDAY',
        lines: ['someone new wakes up late: ' + g.newOwner + '.',
                'yesterday they bought a coat that had a whole week inside it.',
                'the first thing anyone does with a second-hand coat is reach into the pockets.'] });
      cards.push(foundCard('WHAT THEIR HAND FINDS'));
      if (holeCard) cards.push(holeCard);
      cards.push({ head: 'WORD TRAVELS', lines: g.arc.outcome(g) });
      cards.push({ head: 'AND THE POCKET',
        lines: ['new lint. new weather. new weight.', 'i begin again. i always begin again.'] });
    }
    return cards;
  };

  /* end-screen fate list */
  SH.buildFates = function (g) {
    const rows = [];
    const seen = {};
    for (const it of g.items) {
      const label = it.label + (seen[it.label] ? ' (another)' : '');
      seen[it.label] = true;
      rows.push({ label, fate: it.fate });
    }
    return rows;
  };
})();
