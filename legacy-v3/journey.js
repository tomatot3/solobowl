/* Practical meal constraints used by the same catalogue, plan and cooking flow. */
window.SYS_MEAL_CONTEXT = {
 suantang:{meal:true,readyRice:false,equipment:'pot',quick:false,active:'约 12 分钟',prep:'先确认米线是否已经泡软。干米线如果需要长时间浸泡，今晚赶时间就换成挂面，并按挂面包装煮制。',wash:'汤锅、餐碗、刀、砧板和筷勺。',buy:{base:'先看家里有没有。需要买时，选能用于煮汤的酸汤底料，并核对包装建议比例。',noodle:'看清是即煮型还是需要浸泡的干米线。赶时间时选即煮型。',tofu:'选小包装嫩豆腐；表中是本顿用量，包装有余量可以留作另一顿。'}},
 tomato:{meal:true,readyRice:true,equipment:'pot',quick:false,active:'约 15 分钟',prep:'先准备热米饭，再切番茄、打鸡蛋。炒蛋时用打蛋的碗暂时盛出熟蛋，可以少拿一个容器；盛回前把碗洗净。',wash:'炒锅、餐碗、打蛋碗、刀、砧板和锅铲。',buy:{tomato:'按个选购即可，大小有差别时调整用量，不必为凑整额外买一袋。',rice:'这里用的是熟米饭。家里没有时，需另算煮饭时间，或买现成米饭。'}},
 potato:{meal:true,readyRice:true,equipment:'pot',quick:false,active:'约 18 分钟',prep:'先备好热米饭。土豆丝切好、冲洗并沥干，再开火，避免边切菜边看锅。',wash:'炒锅、餐碗、洗土豆丝的容器、刀、砧板和锅铲。',buy:{potato:'优先散买，表中重量是本顿用量。',rice:'这是配菜加熟米饭的安排，米饭需要提前备好。'}},
 scallion:{meal:true,readyRice:false,equipment:'pot',quick:false,active:'约 15 分钟',prep:'先切葱、调酱汁。面煮好后留一点面汤，倒空锅并擦干，再做葱油。',wash:'煮面兼煎葱的锅、餐碗、酱汁碗、刀、砧板和筷勺。',buy:{scallion:'一小把即可。本顿用表中的量，剩余葱按家里的保存习惯处理。'}},
 sesame:{meal:true,readyRice:false,equipment:'pot',quick:true,active:'约 10 分钟',prep:'烧水时切黄瓜、调芝麻酱。面条捞出后马上拌，避免结团。',wash:'汤锅、餐碗、酱汁碗、刀、砧板和筷勺。',buy:{sesame:'用量不多，已有芝麻酱就不必再买。首次购买可以选小瓶，并查看是否含花生等配料。'}},
 cabbage:{meal:true,readyRice:false,equipment:'pot',quick:true,active:'约 8 分钟',prep:'白菜梗和菜叶分开放，鸡蛋先打散。水烧开后按顺序下锅，不用中途再处理食材。',wash:'汤锅、餐碗、打蛋碗、刀、砧板和筷勺。',buy:{cabbage:'优先选小棵或按份售卖的白菜。本顿只用表中的量。',noodle:'挂面按本顿用量取出，剩余仍按原包装保存。'}},
 mushroom:{meal:true,readyRice:false,equipment:'ricecooker',quick:false,active:'约 12 分钟',prep:'先确认电饭煲支持这一份米量。香菇与米一起煮，青菜切好留到饭熟后再加入加热。',wash:'电饭煲内胆、餐碗、刀、砧板和饭勺。',buy:{rice:'这里用的是生大米。按电饭煲最低烹煮量决定是否做一人份。',mushroom:'鲜香菇按朵或小份买。使用干香菇需要另留泡发时间。'}},
 pumpkin:{meal:false,readyRice:false,equipment:'pot',quick:false,active:'约 10 分钟',prep:'先把南瓜切小块。小火煮粥期间仍需留意溢锅和锅底，不能完全放着不管。',wash:'汤锅、餐碗、刀、砧板和汤勺。',buy:{pumpkin:'选切块售卖的小份南瓜更省事，确认标注的净重。'}},
 radish:{meal:false,readyRice:false,equipment:'pot',quick:false,active:'约 10 分钟',prep:'萝卜切薄片，豆腐切块后分开放。先把萝卜煮软，再轻轻放入豆腐。',wash:'汤锅、餐碗、刀、砧板和汤勺。',buy:{radish:'选小根萝卜或切段包装，表中是本顿用量。',tofu:'选小包装嫩豆腐；有余量时，下一顿可以搭配青菜或面。'}},
 lotus:{meal:false,readyRice:false,equipment:'pot',quick:false,active:'约 12 分钟',prep:'莲藕和香菇提前切好，选择足够深的锅。想喝汤的同时吃饭，需要另备主食。',wash:'汤锅、餐碗、刀、砧板和汤勺。',buy:{lotus:'按段或小份买。喜欢脆口还是粉糯，可以选购时向商家确认。'}},
 'egg-soup':{meal:false,readyRice:false,equipment:'pot',quick:true,active:'约 6 分钟',prep:'先打好蛋液，紫菜按包装处理。这是一份配汤，主食另备。',wash:'汤锅、餐碗、打蛋碗和筷勺。',buy:{seaweed:'只需少量。已有紫菜时不需要为这顿饭再买一包。'}},
 'pepper-tofu':{meal:true,readyRice:true,equipment:'pot',quick:false,active:'约 18 分钟',prep:'先准备热米饭。豆腐切块后擦干表面，青椒切好，再开火煎豆腐。',wash:'炒锅、餐碗、刀、砧板和锅铲。',buy:{tofu:'选择北豆腐或老豆腐，更容易煎成块。表中是本顿用量。',rice:'这里用熟米饭，另煮米饭的时间不在炒菜时间内。'}}
};
