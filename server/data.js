// 奥地利大饭店 — 游戏数据
// 餐点颜色：brown=点心, white=蛋糕, red=葡萄酒, black=咖啡
const FOOD = ['brown', 'white', 'red', 'black'];
const FOOD_NAME = { brown: '点心', white: '蛋糕', red: '葡萄酒', black: '咖啡' };

// 效果简写
const E = {
  royal: n => ({ t: 'royal', n }),
  money: n => ({ t: 'money', n }),
  food: (c, n) => ({ t: 'food', c, n }),
  anyFood: n => ({ t: 'anyFood', n }),
  draw: n => ({ t: 'draw', n }),
  play: d => ({ t: 'play', d }),          // 打出员工，减费 d（99=免费）
  d3p: d => ({ t: 'd3p', d }),            // 抓3张打1张，减费 d
  room: (d, n = 1) => ({ t: 'room', d, n }), // 准备客房，减费 d（99=免费）
  roomLow: () => ({ t: 'roomLow' }),      // 免费准备1-2层客房
  flip: n => ({ t: 'flip', n }),          // 翻转已准备客房为已入住
  guest: () => ({ t: 'guest' }),          // 免费拿取宾客
  extraTurn: () => ({ t: 'extraTurn' }),
};
const FREE = 99;

// 宾客卡：color = green(游客) / yellow(艺术家) / blue(贵族) / red(市民)
const GUESTS = [
  // 绿色 游客
  { id: 'g91', name: '特斯卡特利波卡', color: 'green', req: ['brown'], pts: 0, fx: [E.draw(3)] },
  { id: 'g92', name: '金钩船长', color: 'green', req: ['brown'], pts: 0, fx: [E.money(1)] },
  { id: 'g93', name: '霍隆先生', color: 'green', req: ['brown'], pts: 0, fx: [E.royal(1)] },
  { id: 'g94', name: '英格蒙斯', color: 'green', req: ['brown', 'brown'], pts: 0, fx: [E.play(1)] },
  { id: 'g95', name: '博伊德尔先生', color: 'green', req: ['brown', 'white'], pts: 2, fx: [E.royal(2)] },
  { id: 'g96', name: '欧多先生', color: 'green', req: ['brown', 'black'], pts: 0, fx: [E.play(3)] },
  { id: 'g97', name: '埃及法老', color: 'green', req: ['brown', 'brown', 'red'], pts: 4, fx: [E.extraTurn()] },
  { id: 'g98', name: '马可波罗', color: 'green', req: ['brown', 'brown', 'brown'], pts: 0, fx: [E.money(4)] },
  { id: 'g99', name: '克莱默', color: 'green', req: ['brown', 'white', 'white'], pts: 5, fx: [E.draw(1), E.royal(2)] },
  { id: 'g100', name: '弗朗茨', color: 'green', req: ['brown', 'black', 'black', 'black'], pts: 4, fx: [E.flip(1), E.royal(3)] },
  { id: 'g101', name: '尤伍', color: 'green', req: ['brown', 'brown', 'brown', 'black'], pts: 3, fx: [E.guest(), E.royal(3)] },
  { id: 'g102', name: '信息员', color: 'green', req: ['brown', 'black'], pts: 0, fx: [E.flip(1), E.royal(1)] },
  { id: 'g103', name: '迪尔戈因', color: 'green', req: ['brown', 'red'], pts: 4, fx: [E.draw(2)] },
  { id: 'g104', name: '麦克劳德', color: 'green', req: ['brown', 'brown', 'white', 'white'], pts: 2, fx: [E.play(FREE)] },
  // 黄色 艺术家
  { id: 'y49', name: '雕塑家', color: 'yellow', req: ['red'], pts: 0, fx: [E.roomLow()] },
  { id: 'y50', name: '音乐家', color: 'yellow', req: ['red'], pts: 0, fx: [E.room(0), E.draw(1)] },
  { id: 'y51', name: '作家', color: 'yellow', req: ['red'], pts: 1, fx: [E.food('brown', 1)] },
  { id: 'y52', name: '剧作家', color: 'yellow', req: ['black', 'red'], pts: 0, fx: [E.food('brown', 1), E.money(2)] },
  { id: 'y53', name: '舞蹈家', color: 'yellow', req: ['red', 'brown'], pts: 0, fx: [E.food('black', 1), E.royal(2)] },
  { id: 'y54', name: '肖像画家', color: 'yellow', req: ['red', 'red'], pts: 0, fx: [E.anyFood(1), E.money(2)] },
  { id: 'y55', name: '摄影师', color: 'yellow', req: ['red', 'red', 'red'], pts: 7, fx: [E.draw(2)] },
  { id: 'y56', name: '歌唱家', color: 'yellow', req: ['red', 'red', 'brown'], pts: 0, fx: [E.food('white', 1), E.play(3)] },
  { id: 'y57', name: '建筑师', color: 'yellow', req: ['black', 'red', 'red'], pts: 1, fx: [E.room(1, 2)] },
  { id: 'y58', name: '女演员', color: 'yellow', req: ['black', 'red', 'red', 'red'], pts: 7, fx: [E.flip(1)] },
  { id: 'y59', name: '诗人', color: 'yellow', req: ['red', 'brown', 'brown', 'brown'], pts: 5, fx: [E.food('white', 1), E.play(2)] },
  { id: 'y60', name: '珠宝设计师', color: 'yellow', req: ['red', 'red', 'white', 'white'], pts: 5, fx: [E.food('black', 1), E.money(3)] },
  { id: 'y61', name: '画家', color: 'yellow', req: ['red', 'red', 'red', 'brown'], pts: 2, fx: [E.room(1, 2)] },
  { id: 'y62', name: '歌剧演唱家', color: 'yellow', req: ['red', 'red', 'white', 'brown'], pts: 4, fx: [E.guest(), E.royal(3)] },
  { id: 'y63', name: '美拉斯先生', color: 'yellow', req: ['white', 'black'], pts: 4, fx: [E.guest()] },
  // 蓝色 贵族
  { id: 'b63', name: '男爵夫人', color: 'blue', req: ['black'], pts: 0, fx: [E.guest()] },
  { id: 'b64', name: '公爵夫人', color: 'blue', req: ['black'], pts: 0, fx: [E.play(1)] },
  { id: 'b65', name: '帝国骑士', color: 'blue', req: ['black'], pts: 3, fx: [] },
  { id: 'b66', name: '女伯爵', color: 'blue', req: ['black', 'white'], pts: 3, fx: [E.play(1), E.room(1)] },
  { id: 'b67', name: '侯爵', color: 'blue', req: ['black', 'red'], pts: 2, fx: [E.draw(2), E.royal(2)] },
  { id: 'b68', name: '公主', color: 'blue', req: ['black', 'brown', 'brown'], pts: 4, fx: [E.royal(3)] },
  { id: 'b69', name: '伯爵夫人', color: 'blue', req: ['black', 'white', 'white'], pts: 7, fx: [E.money(3)] },
  { id: 'b70', name: '帝国顾问', color: 'blue', req: ['black', 'red', 'brown'], pts: 1, fx: [E.play(1), E.royal(3)] },
  { id: 'b71', name: '男爵', color: 'blue', req: ['black', 'black', 'brown'], pts: 4, fx: [E.room(FREE)] },
  { id: 'b72', name: '王子', color: 'blue', req: ['black', 'white', 'brown'], pts: 7, fx: [E.flip(1)] },
  { id: 'b73', name: '伯爵', color: 'blue', req: ['black', 'black', 'red'], pts: 4, fx: [E.play(1), E.play(1)] },
  { id: 'b74', name: '勋爵', color: 'blue', req: ['black', 'black', 'white'], pts: 10, fx: [E.money(1)] },
  { id: 'b75', name: '女男爵', color: 'blue', req: ['black', 'black', 'red', 'red'], pts: 5, fx: [E.d3p(3)] },
  { id: 'b76', name: '公爵', color: 'blue', req: ['black', 'black', 'brown', 'brown'], pts: 4, fx: [E.d3p(FREE)] },
  // 红色 市民
  { id: 'r77', name: '药剂师', color: 'red', req: ['white'], pts: 1, fx: [E.money(1)] },
  { id: 'r78', name: '邮政顾问', color: 'red', req: ['white'], pts: 0, fx: [E.guest()] },
  { id: 'r79', name: '枢密会委员', color: 'red', req: ['white'], pts: 0, fx: [E.money(1), E.royal(1)] },
  { id: 'r80', name: '名誉教授', color: 'red', req: ['red', 'white'], pts: 4, fx: [E.guest()] },
  { id: 'r81', name: '将军', color: 'red', req: ['white', 'white'], pts: 0, fx: [E.food('red', 1), E.money(3)] },
  { id: 'r82', name: '审计长', color: 'red', req: ['black', 'red', 'white'], pts: 7, fx: [E.flip(1)] },
  { id: 'r83', name: '商务专员', color: 'red', req: ['red', 'white', 'brown'], pts: 0, fx: [E.money(5)] },
  { id: 'r84', name: '法律顾问', color: 'red', req: ['red', 'white', 'white'], pts: 2, fx: [E.money(3), E.guest()] },
  { id: 'r85', name: '少校', color: 'red', req: ['white', 'brown', 'brown'], pts: 3, fx: [E.money(3)] },
  { id: 'r86', name: '森林顾问', color: 'red', req: ['red', 'red', 'white'], pts: 3, fx: [E.play(3)] },
  { id: 'r87', name: '医学顾问', color: 'red', req: ['black', 'black', 'white', 'white'], pts: 3, fx: [E.money(3), E.guest()] },
  { id: 'r88', name: '费迪南德先生', color: 'red', req: ['red', 'red'], pts: 3, fx: [E.royal(3)] },
  { id: 'r89', name: '皇室专员', color: 'red', req: ['red', 'white', 'brown', 'brown'], pts: 5, fx: [E.money(4)] },
  { id: 'r90', name: '高级法务秘书', color: 'red', req: ['white', 'white', 'white', 'brown'], pts: 7, fx: [E.food('red', 1), E.money(3)] },
  { id: 'r91', name: '检察官', color: 'red', req: ['red', 'red', 'red', 'white'], pts: 0, fx: [E.room(FREE, 2)] },
];

// 员工卡 type: once=一次性, round=每轮一次, perm=永久, end=游戏结束
const EMPLOYEES = [
  { id: 1, name: '早餐服务生', cost: 4, type: 'round', set: 'B', fx: [E.food('brown', 1)], text: '获得1块点心' },
  { id: 2, name: '女招待', cost: 6, type: 'round', set: 'D', fx: [E.food('white', 1)], text: '获得1块蛋糕' },
  { id: 3, name: '酒吧经理', cost: 4, type: 'round', set: 'A', fx: [E.food('red', 1)], text: '获得1杯葡萄酒' },
  { id: 4, name: '副主厨', cost: 6, type: 'round', set: 'C', fx: [E.food('black', 1)], text: '获得1杯咖啡' },
  { id: 5, name: '马夫', cost: 4, type: 'perm', text: '红色宾客入住时 +2克朗' },
  { id: 6, name: '饲养员', cost: 1, type: 'perm', set: 'A', text: '蓝色宾客入住时 皇室+1' },
  { id: 7, name: '女按摩师', cost: 1, type: 'perm', set: 'D', text: '黄色宾客入住时 +1克朗' },
  { id: 8, name: '导游', cost: 2, type: 'perm', text: '绿色宾客入住时 +2分' },
  { id: 9, name: '男管家', cost: 5, type: 'perm', set: 'A', text: '免费准备蓝色客房' },
  { id: 10, name: '专职司机', cost: 5, type: 'perm', set: 'D', text: '免费准备红色客房' },
  { id: 11, name: '花匠', cost: 5, type: 'perm', set: 'C', text: '免费准备黄色客房' },
  { id: 12, name: '客房部主管', cost: 2, type: 'perm', text: '拿取【3】或【4】骰子时 +2分' },
  { id: 13, name: '餐厅经理', cost: 2, type: 'perm', set: 'B', text: '拿取【1】或【2】骰子时 额外+1份餐点/饮料' },
  { id: 14, name: '装潢师', cost: 2, type: 'perm', text: '拿取【1】或【2】骰子时 可准备1间客房' },
  { id: 15, name: '擦鞋匠', cost: 4, type: 'perm', text: '拿取【4】骰子时 皇室和资金各推进（不必二选一）' },
  { id: 16, name: '洗衣工', cost: 2, type: 'perm', text: '拿取【4】骰子时 +4分' },
  { id: 17, name: '厨工', cost: 3, type: 'perm', text: '免费使用【6】，且行动格【6】骰子数+1' },
  { id: 18, name: '寄管员', cost: 2, type: 'perm', text: '拿取【5】骰子时 额外减费2克朗' },
  { id: 19, name: '内饰建筑师', cost: 3, type: 'perm', text: '拿取【3】骰子时 +5分' },
  { id: 20, name: '侦探', cost: 2, type: 'perm', text: '拿取【5】骰子时 皇室+2' },
  { id: 21, name: '主厨', cost: 3, type: 'once', fx: [E.food('brown', 1), E.food('white', 1), E.food('red', 1), E.food('black', 1)], text: '获得点心、蛋糕、葡萄酒、咖啡各1' },
  { id: 22, name: '人事经理', cost: 3, type: 'perm', text: '拿取【3】骰子时 可从手中打出1张员工（付全价）' },
  { id: 23, name: '监管人', cost: 5, type: 'perm', text: '每位宾客入住时 +1克朗' },
  { id: 24, name: '餐厅领班', cost: 1, type: 'perm', set: 'C', text: '免费从厨房移动餐点到宾客' },
  { id: 25, name: '行李员', cost: 6, type: 'perm', set: 'B', text: '免费拿取宾客' },
  { id: 26, name: '会议经理', cost: 5, type: 'perm', text: '皇室记录条在【0】时，支付1克朗免除惩罚' },
  { id: 27, name: '订房部经理', cost: 4, type: 'end', set: 'C', text: '每间已入住红色客房 3分' },
  { id: 28, name: '礼宾员', cost: 4, type: 'end', set: 'D', text: '每间已入住蓝色客房 3分' },
  { id: 29, name: '秘书', cost: 5, type: 'end', text: '复制其他玩家一张【游戏结束】员工' },
  { id: 30, name: '总台接待员', cost: 4, type: 'end', set: 'B', text: '每间已入住黄色客房 3分' },
  { id: 31, name: '女服务员', cost: 4, type: 'end', text: '每间已入住客房 1分' },
  { id: 32, name: '助理经理', cost: 4, type: 'end', set: 'B', text: '每张已打出员工 2分' },
  { id: 33, name: '楼层男主管', cost: 5, type: 'perm', text: '满足4个餐点需求的宾客入住时 +4分' },
  { id: 34, name: '前台接待', cost: 5, type: 'end', text: '酒店中每间客房（无论是否入住）1分' },
  { id: 35, name: '门童', cost: 2, type: 'once', fx: [E.flip(2)], text: '将2间已准备客房翻为已入住' },
  { id: 36, name: '酒侍', cost: 2, type: 'once', set: 'D', fx: [E.food('red', 4)], text: '获得4杯葡萄酒' },
  { id: 37, name: '客房服务生', cost: 3, type: 'end', text: '每个全部入住的区域 2分' },
  { id: 38, name: '递送员', cost: 5, type: 'once', set: 'A', fx: [{ t: 'deliver' }], text: '从公共供应堆满足一位宾客的全部点餐' },
  { id: 39, name: '甜点师', cost: 3, type: 'once', set: 'A', fx: [E.food('white', 4)], text: '获得4块蛋糕' },
  { id: 40, name: '市场总监', cost: 2, type: 'end', set: 'C', text: '每张放置过圆片的政务卡 5分' },
  { id: 41, name: '接线员', cost: 3, type: 'end', set: 'D', text: '皇室记录条位置 ×2 分' },
  { id: 42, name: '园丁', cost: 3, type: 'perm', text: '每次获得皇室奖励时 +5分' },
  { id: 43, name: '咖啡师', cost: 3, type: 'once', set: 'C', fx: [E.food('black', 4)], text: '获得4杯咖啡' },
  { id: 44, name: '点心师', cost: 2, type: 'once', set: 'B', fx: [E.food('brown', 4)], text: '获得4块点心' },
  { id: 45, name: '泳池服务员', cost: 1, type: 'once', fx: [E.royal(3)], text: '皇室记录条推进3格' },
  { id: 46, name: '楼层女主管', cost: 2, type: 'end', text: '每层全部入住的楼层 5分' },
  { id: 47, name: '电梯服务员', cost: 4, type: 'end', text: '每列全部入住的客房 5分' },
  { id: 48, name: '酒店经理', cost: 4, type: 'end', set: 'A', text: '每套3种颜色已入住客房 4分' },
];
// 入门推荐组合（规则书第12页）
const STARTER_SETS = {
  A: [3, 6, 9, 38, 39, 48],
  B: [1, 13, 25, 30, 32, 44],
  C: [4, 11, 24, 27, 40, 43],
  D: [2, 7, 10, 28, 36, 41],
};

// 政务卡
const POLITICS = [
  { id: 'A1', grp: 'A', text: '拥有至少20克朗', icon: '💶20' },
  { id: 'A2', grp: 'A', text: '皇室记录条达到第10格或更高', icon: '👑10' },
  { id: 'A3', grp: 'A', text: '已打出至少6张员工卡', icon: '🧑‍💼6' },
  { id: 'A4', grp: 'A', text: '酒店版图上至少有12块客房板块', icon: '🚪12' },
  { id: 'B1', grp: 'B', text: '至少2层客房全部入住', icon: '▤2层' },
  { id: 'B2', grp: 'B', text: '至少2列客房全部入住', icon: '▥2列' },
  { id: 'B3', grp: 'B', text: '至少6个区域全部入住', icon: '▦6区' },
  { id: 'B4', grp: 'B', text: '某一种颜色的所有客房都已入住', icon: '■全色' },
  { id: 'C1', grp: 'C', text: '每种颜色各至少3间已入住客房', icon: '3/3/3' },
  { id: 'C2', grp: 'C', text: '至少4间红色和3间黄色客房已入住', icon: '4红3黄' },
  { id: 'C3', grp: 'C', text: '至少4间黄色和3间蓝色客房已入住', icon: '4黄3蓝' },
  { id: 'C4', grp: 'C', text: '至少4间蓝色和3间红色客房已入住', icon: '4蓝3红' },
];

// 皇室板块
const ROYAL_TILES = [
  { id: 'A1', grp: 'A', reward: '获得3克朗', penalty: '失去3克朗，或失去5分' },
  { id: 'A2', grp: 'A', reward: '获得任意2个餐点/饮料', penalty: '厨房里所有餐点放回供应堆' },
  { id: 'A3', grp: 'A', reward: '抓3张员工，打出其中1张（减3克朗）', penalty: '将2张手牌放回牌堆底，或失去5分' },
  { id: 'A4', grp: 'A', reward: '免费准备1间客房', penalty: '失去5分，或移除1间最高层未入住客房' },
  { id: 'B1', grp: 'B', reward: '点心、蛋糕、葡萄酒、咖啡各1', penalty: '厨房和宾客上的所有餐点放回供应堆' },
  { id: 'B2', grp: 'B', reward: '获得5克朗', penalty: '失去5克朗，或失去7分' },
  { id: 'B3', grp: 'B', reward: '抓3张员工，免费打出其中1张', penalty: '将3张手牌放回牌堆底，或失去7分' },
  { id: 'B4', grp: 'B', reward: '在第1或第2层放置任意颜色客房，并立即入住', penalty: '失去7分，或移除2间最高层未入住客房' },
  { id: 'C1', grp: 'C', reward: '获得8分', penalty: '失去8分' },
  { id: 'C2', grp: 'C', reward: '在任意位置放置任意颜色客房，并立即入住', penalty: '移除2间最高层已入住客房' },
  { id: 'C3', grp: 'C', reward: '每张已打出员工 2分', penalty: '每张已打出员工 -2分' },
  { id: 'C4', grp: 'C', reward: '免费打出1张手牌员工', penalty: '弃掉1张已打出的【游戏结束】员工，或失去10分' },
];

// 酒店版图：rows[0] = 第一层（底层）... rows[3] = 顶层；B蓝 Y黄 R红
const BOARDS = {
  moon: ['BYRRB', 'YYRRY', 'BRBYY', 'BRBRB'],
  A: ['RYRRY', 'BYBBB', 'BYRRY', 'BYBBR'],
  B: ['BYRRR', 'BYRBY', 'BRBRY', 'YBBRB'],
  C: ['RBRYR', 'RBYYY', 'RYRBB', 'BYRBY'],
  D: ['RBRRB', 'YBYYY', 'YBBRB', 'RRRYB'],
};
const CELL_COLOR = { B: 'blue', Y: 'yellow', R: 'red' };
const FLOOR_COST = [0, 1, 2, 3];
const FLOOR_PTS = [1, 2, 3, 4];
// 客房格上印制的即时分数
const ROOM_PTS = { '3-2': 2, '3-3': 2, '3-4': 2, '2-3': 1, '2-4': 1 };
// 区域入住奖励（按区域大小1..4）
const ZONE_REWARD = {
  blue: [2, 5, 9, 15],   // 分数
  red: [1, 3, 6, 10],    // 克朗
  yellow: [1, 3, 6, 10], // 皇室推进
};
// 皇室记录条每格对应分数 0..13
const ROYAL_PTS = [0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 9];
const ROYAL_BACK = { 3: 3, 5: 5, 7: 7 };
const GUEST_SLOT_COST = [3, 2, 1, 0, 0];
const DICE_BY_PLAYERS = { 2: 10, 3: 12, 4: 14 };
const TURN_TILES = { 2: [[1, 4], [2, 3]], 3: [[1, 6], [2, 5], [3, 4]], 4: [[1, 8], [2, 7], [3, 6], [4, 5]] };
const PLAYER_COLORS = ['orange', 'blue', 'pink', 'green'];
const MONEY_MAX = 20;

const __GH = {
  FOOD, FOOD_NAME, GUESTS, EMPLOYEES, STARTER_SETS, POLITICS, ROYAL_TILES, BOARDS, CELL_COLOR,
  FLOOR_COST, FLOOR_PTS, ROOM_PTS, ZONE_REWARD, ROYAL_PTS, ROYAL_BACK, GUEST_SLOT_COST,
  DICE_BY_PLAYERS, TURN_TILES, PLAYER_COLORS, MONEY_MAX, FREE,
};
if (typeof module !== 'undefined' && module.exports) module.exports = __GH; else window.GH = __GH;
