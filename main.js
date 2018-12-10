const fs = require('fs')
const { Client, Collection, RichEmbed } = require('discord.js')

const token = fs.readFileSync('token').toString()
const client = new Client()

const SUCCESS = 0x21842C // nice green
const FAIL = 0xAF3333    // sad red
const INFO = 0xADD8E6    // light blue
const ERROR = 0xFF0000   // pure red
const TIER_COLOR = [[0xFFFFFF],
    [
        0xFFFFFF,            // white
        0x777777,            // gray
        0x555555,            // dark gray
    ],
]

let items = new Collection()

function put_item(id, item) {
    items.set(id, item)
}
function has_item(id) {
    return items.has(id)
}
function get_item(id) {
    return items.get(id)
}

const adjectives = ['Hairy', 'Smelly', 'Shiny', 'Blue', 'Red', 'Grassy', 'Cheesy', 'Charming', 'Sticky', 'Mouldy', 'Mossy']
const nouns = ['Ball', 'Stick', 'Brick', 'Cheese', 'Loaf of Bread', 'Twig', 'Rock', 'Turd', 'Carrot', 'Donut']
const item_prototype = {
    name: '',
    tier: 1,
    level: 1,
    xp: 0,
    stars: 0,
    shards: 0,
    shards_left: 0,
    expansions: 0,
    enchant_tier: 0,
    enchant_matrix: [],

    base_attack: 0,
    bonus_attack: 0,
    base_strength: 0,
    bonus_strength: 0,
}
function new_item(tier) {
    const clone = JSON.parse(JSON.stringify(item_prototype))
    const name = adjectives[Math.floor(Math.random() * adjectives.length)] + ' '
            + nouns[Math.floor(Math.random() * nouns.length)]
    clone.name = name
    clone.base_attack = 9
    clone.base_strength = 0
    clone.shards_left = shard_limit[tier]
    return clone
}
function display_stars(level) {
    return '★'.repeat(Math.floor(level / 5)) + '⭑'.repeat(level % 5)
}
function _display_level(item) {
    const tnl = xp_tnl(item.level, item.tier)
    return '**LEVEL ' + item.level + '** | '
        + item.xp + '/' + tnl + 'XP'
        // can't get the XP bar to look good
        // + '\n' + '█'.repeat(Math.round(item.xp * 10 / tnl)) + '▒'.repeat(10 - Math.round(item.xp * 10 / tnl))
}
function _display_shards(item) {
    return 'Sharded: **' + item.shards + 'x** | ' + item.shards_left + ' shards remaining'
}
function _display_stat(stat, base, bonus) {
    if (base + bonus === 0) {
        return ''
    }
    return '**' + stat + ':** ' + (base + bonus)
        + ((bonus === 0) ? '' : ' *(' + base + '**+' + bonus + '**)*')
        + '\n'
}
function display_item(item, channel) {
    const embed = new RichEmbed()
        .setTitle(item.name
            + ((item.stars === 0) ? '' : ' ' + display_stars(item.stars)))
        .setColor(TIER_COLOR[item.tier][_item_get_subtier(item)])
        .setDescription(_display_level(item) + '\n'
            + _display_shards(item) + '\n'
            + '\n'
            + _display_stat('ATT', item.base_attack, item.bonus_attack)
            + _display_stat('STR', item.base_strength, item.bonus_strength))
    channel.send(embed)
}
function _item_get_subtier(item) {
    const level_progress = item.level / max_level(item.tier)
    const star_progress = item.stars / max_star(item.tier)
    const shard_progress = item.shards / max_shard(item)
    const progress = (level_progress + star_progress + shard_progress) / 3
    return Math.floor(progress * (TIER_COLOR[item.tier].length - 1))
}

/* 
 * 
 */

/* Levels are pretty straight forward. They work just like weapon levels in any other game.
 * XP is gained slowly through item usage.
 * Level limit depends on tier.
 * TODO: Soften the curve if level depends on time spent using equipment.
 */
// max level 30
const xp_table = [0, 50, 68, 92, 126,       // base 50, quadruple every 5 levels
    215, 294, 401, 547, 746,                // initial multiplier of 1.25, quadruple every 5
    1307, 1526, 1781, 2080, 2429,           // initial multiplier of 1.5, quadruple every 20
    4964, 5796, 6768, 7903, 9228,           // initial multiplier of 1.75, quadruple every 20
    19944, 21551, 23287, 25164, 27192,      // initial multiplier of 2, quadruple every 80
    57447, 60683, 64101, 67711, 71526,      // initial multiplier of 2, quadruple every 160
]
const level_limit = [1, 10, 20, 30]
function max_level(tier) {
    return level_limit[tier]
}
function xp_tnl(level, tier) {
    if (level >= xp_table.length || level >= level_limit[tier]) {
        return 0
    }
    return xp_table[level]
}
function add_xp(level, xp, tier) {    // return {level, xp}
    let tnl = xp_tnl(level, tier)
    while (xp >= tnl) {
        if (tnl === 0) {  // max level already
            return {level, xp}
        }
        xp -= tnl
        level += 1
        tnl = xp_tnl(level, tier)
    }
    return {level, xp}
}
function xp_to_level(level, item) {
    if (item.level >= level) {
        return 0
    }
    level = Math.min(level, max_level(item.tier))
    xp = 0
    cur_level = item.level
    while (cur_level < level) {
        xp += xp_tnl(cur_level, item.tier)
        cur_level += 1
    }
    return xp
}
function item_add_xp(item, xp) {
    const old_level = item.level
    Object.assign(item, add_xp(item.level, item.xp + xp, item.tier))
    const level_difference = item.level - old_level   
    for (let i = 0; i < level_difference; i += 1) {
        _item_level_up(item)
    }
}
function _item_level_up(item) {
    if (item.tier === 1) {
        if (item.level > 5) {
            item.bonus_attack += 1
            item.bonus_strength += 2
        } else {
            item.bonus_strength += 1
        }
    }
}

/* Starring is analogous to star enhancing in Maplestory.
 * Like in Maplestory, sharding (scrolling) must be done before starring.
 * Stars give varying bonuses that depend on star level. Unlike Maplestory, it does not depend on the item's current stats.
 * Suggest using multiplicative rate bonuses instead of additive (+10% makes a 1% attempt too easy)
 */
const star_rate = [[],
    [1, 1, 1, 0.8, 0.5],
    [1, 1, 0.9, 0.75, 0.5, 0.3, 0.15, 0.075, 0.03, 0.01],
]
function max_star(tier) {
    return star_rate[tier].length
}
function star_item(item) {    // returns [success, level], -1 on max star
    if (item.stars >= max_star(item.tier)) {
        return [-1, item.stars]
    }
    if (Math.random() < star_rate[item.tier][item.stars]) {
        _star(item)
        return [true, item.stars]
    }
    return [false, item.stars]
}
function _star(item) {
    item.stars += 1
    if (item.tier === 1) {
        item.bonus_strength += 1
    }
}

/* Sharding is analogous to scrolling in Maplestory, except with a 100% success rate.
 * The limiting reagent comes from collecting the currency to shard an item. The cost goes up with tier.
 * Note that each shard should provide the exact same bonuses each time.
 * Extra shard slots can be added. Do note this affects max_shard() of an item. (TODO: haven't implemented yet)
 */
const shard_limit = [0, 5, 7, 8]
function max_shard(item) {
    return item.shards + item.shards_left
}
function shard_item(item) {
    if (item.shards_left <= 0) {
        return false
    }
    _shard(item)
    return true
}
function _shard(item) {
    item.shards += 1
    item.shards_left -= 1
    if (item.tier === 1) {
        item.bonus_strength += 2
    }
}

/* Expansion is equivalent to hammering in Maplestory; it increases the number of shard slots available.
 * Expansions should be costly, but each expansion should cost the same.
 */
const expansion_limit = 2
function max_expansion(item) {
    return expansion_limit
}
function expand_item(item) {
    if (item.expansions >= expansion_limit) {
        return false
    }
    _expand(item)
    return true
}
function _expand(item) {
    item.shards_left += 1
    item.expansions += 1
}

/* Enchanting is the same as cubing in Maplestory. It is a random roll every time.
 * To encourage re-rolling even once you have a good roll, players are given the option to pick their previous roll.
 * Unlike in Maplestory, there aren't many garbage rolls (DEF +12%, Damage Taken -30%, etc.), so it feels like
 *   you're getting something decent every time.
 * The rarity comes in the value of the roll; unlike in Maplestory you are not guaranteed either 9% or 12% at Legendary,
 *   you are instead given a large range of values, allowing room for min/maxing. This is much like the inner ability system.
 * These stats are accounted for after all base + bonus stats are added, meaning % stats get the best bang for their buck.
 */

/* Because of how many combinations of enchantments you can have, the data is best stored in a matrix.
 * The matrix is a list of enchants. Each enchant is either a flat addition or % multiplier of one stat.
 * Enchants are stored as a triplet: [0] is an index of the represented stat, [1] is a boolean of whether the stat is %,
 *   and [2] is the numerical amount.
 * Below is a mockup of a matrix.
 * 
 * [
 *   [0, true, 5],    // Enchant 1, 5% ATT
 *   [1, false, 20],  // Enchant 2, +20 STR
 * ]
 * 
 * You can find a mapping of indices to stats below.
 */
const stat_names = [
    'ATT',
    'STR',
]

/* Unlike regular item stats, enchanted stats cannot be processed in linear fashion, adding on item's stats to 
 *   where the previous left off. This is because of how % stats are processed - they need to be done last.
 * Thus, a stat vector is compiled linearly, having entries for both % and flat versions of each stat.
 * More information can be found earlier above in the stat section.
 */

client.on('ready', () => {
    console.log('Ready.')
})

client.on('message', message => {
    if (message.author.bot) {
        return
    }

    let args = message.content.match(/(?:[^\s"“”]+|["“”][^"“”]+["“”])/gi)
    if (!args) {
        return
    }
    args = args.map(x => x.replace(/["“”]/gi, ''))

    if (!args[0].match(/^\/.*$/i)) {
        return
    }

    if (args[0].match(/^\/start$/i)) {
        let embed = new RichEmbed()
            .setTitle('Welcome to Logikable\'s Equipment Simulator!')
            .setColor(INFO)
            .setDescription('I\'ve tried many times to make a game playable on Discord. Only after five attempts '
                + 'did I realize that what I really wanted was just an item enhancement simulator. This is my attempt '
                + 'at making that.\n\n'
                + 'With that, here\'s **your first item**!')
        message.channel.send(embed)
        
        const item = new_item(1)
        display_item(item, message.channel)
        put_item(message.author.id, item)
        return
    }
    if (!has_item(message.author.id)) {
        const embed = new RichEmbed()
            .setTitle('You need an item to do that! Type `/start` to get started.')
            .setColor(ERROR)
        message.channel.send(embed)
        return
    }
    const item = get_item(message.author.id)
    if (args[0].match(/^\/xp$/i)) {
        let xp = 1
        if (args.length >= 2) {
            let matches = args[1].match(/^(\d+)$/i)
            if (!matches) {
                const embed = new RichEmbed()
                    .setTitle('Invalid xp value, must be a whole number.')
                    .setColor(ERROR)
                message.channel.send(embed)
                return
            }
            matches = matches.slice(1)
            xp = parseInt(matches[0])
        }

        item_add_xp(item, xp)
        const embed = new RichEmbed()
            .setTitle('Added ' + xp + 'XP to ' + item.name)
            .setColor(INFO)
        message.channel.send(embed)
    } else if (args[0].match(/^\/(?:show|item)$/i)) {
        display_item(item, message.channel)
    } else if (args[0].match(/^\/star$/i)) {
        const [success, level] = star_item(item)
        if (success === -1) {
            const embed = new RichEmbed()
                .setTitle(item.name + ' is at max stars (' + display_stars(level) + ')!')
                .setColor(INFO)
            message.channel.send(embed)
        } else if (success) {
            const embed = new RichEmbed()
                .setTitle('Starring succeeded! ' + item.name + ' is now ' + display_stars(level) + '!')
                .setColor(SUCCESS)
            message.channel.send(embed)
        } else {
            const embed = new RichEmbed()
                .setTitle('Starring failed. ' + item.name + ' is still ' + display_stars(level) + '.')
                .setColor(FAIL)
            message.channel.send(embed)
        }
    } else if (args[0].match(/^\/sudostar$/i)) {
        let times = 1
        if (args.length >= 2) {
            let matches = args[1].match(/^(\d+)$/i)
            if (!matches) {
                const embed = new RichEmbed()
                    .setTitle('Invalid number of stars, must be a whole number.')
                    .setColor(ERROR)
                message.channel.send(embed)
                return
            }
            matches = matches.slice(1)
            times = parseInt(matches[0])
        }

        for (let i = 0; i < times; i += 1) {
            _star(item)
        }
        const embed = new RichEmbed()
            .setTitle('Starred ' + item.name + ' up to **' + times + '** time(s).')
            .setColor(SUCCESS)
        message.channel.send(embed)
    } else if (args[0].match(/^\/shard$/i)) {
        const success = shard_item(item)
        if (success) {
            const embed = new RichEmbed()
                .setTitle('Sharding succeeded! ' + item.name + ' has ' + item.shards_left + ' shards left.')
                .setColor(SUCCESS)
            message.channel.send(embed)
        } else {
            const embed = new RichEmbed()
                .setTitle(item.name + ' is at shard capacity!')
                .setColor(INFO)
            message.channel.send(embed)
        }
    } else if (args[0].match(/^\/sudoshard$/i)) {
        let times = 1
        if (args.length >= 2) {
            let matches = args[1].match(/^(\d+)$/i)
            if (!matches) {
                const embed = new RichEmbed()
                    .setTitle('Invalid number of shards, must be a whole number.')
                    .setColor(ERROR)
                message.channel.send(embed)
                return
            }
            matches = matches.slice(1)
            times = parseInt(matches[0])
        }

        for (let i = 0; i < times; i += 1) {
            _shard(item)
        }
        const embed = new RichEmbed()
            .setTitle('Sharded ' + item.name + ' up to **' + times + '** time(s).')
            .setColor(SUCCESS)
        message.channel.send(embed)
    } else if (args[0].match(/^\/max$/i)) {
        for (let i = 0; i < max_expansion(item); i += 1) {
            _expand(item)
        }
        for (let i = 0; i < max_shard(item); i += 1) {
            _shard(item)
        }
        for (let i = 0; i < max_star(item.tier); i += 1) {
            _star(item)
        }
        item_add_xp(item, xp_to_level(max_level(item.tier), item))
        const embed = new RichEmbed()
            .setTitle('Maxed ' + item.name + '!')
            .setColor(SUCCESS)
        message.channel.send(embed)
    } else if (args[0].match(/^\/expand$/i)) {
        const success = expand_item(item)
        if (success) {
            const embed = new RichEmbed()
                .setTitle('Expansion succeeded! ' + item.name + ' has '
                    + (expansion_limit(item) - item.expansions) + ' expansion(s) left.')
                .setColor(SUCCESS)
            message.channel.send(embed)
        } else {
            const embed = new RichEmbed()
                .setTitle(item.name + ' can no longer be expanded.')
                .setColor(SUCCESS)
            message.channel.send(embed)
        }
    }
})

client.login(token)
