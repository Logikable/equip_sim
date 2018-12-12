const fs = require('fs')
const sleep = require('system-sleep')
const { Client, Collection, DMChannel, RichEmbed } = require('discord.js')

const token = fs.readFileSync('token').toString()
const client = new Client()

const SUCCESS = 0x21842C    // nice green
const FAIL = 0xAF3333       // sad red
const INFO = 0xADD8E6       // light blue
const ERROR = 0xFF0000      // pure red
const TIER_COLOR = [[0xFFFFFF],
    [                   // tier 1
        0xFFFFFF,           // white
        0x777777,           // gray
        0x555555,           // dark gray
    ],
]

const REACT_ONE = '\u0031\u20E3'
const REACT_TWO = '\u0032\u20E3'
const REACT_YES = '🇾'
const REACT_NO = '🇳'
const EMBED_SPACER = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n'

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
const ITEM_PROTOTYPE = {
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
    const clone = JSON.parse(JSON.stringify(ITEM_PROTOTYPE))
    const name = adjectives[Math.floor(Math.random() * adjectives.length)] + ' '
            + nouns[Math.floor(Math.random() * nouns.length)]
    clone.name = name
    clone.base_attack = 9
    clone.base_strength = 0
    clone.shards_left = SHARD_LIMIT[tier]
    return clone
}
function display_name(item) {
    return '**' + item.name + '**' + ((item.stars === 0) ? '' : ' ' + _display_stars(item.stars))
}
function _display_stars(level) {
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
    return 'Sharded: ' + item.shards + '/' + max_shard(item) + 'x'
}
function _display_stat(stat, base, bonus) {
    if (base + bonus === 0) {
        return ''
    }
    return '**' + stat + ':** ' + (base + bonus)
        + ((bonus === 0) ? '' : ' *(' + base + '**+' + bonus + '**)*')
        + '\n'
}
function display_enchant(matrix, tier) {
    let body_array = []
    for (let i = 0; i < enchant_lines(matrix); i += 1) {
        const [stat_index, is_percentage, value] = matrix[i]
        const str = '+' + value
            + ((is_percentage === 1) ? '%' : '')
            + ' ' + STAT_NAMES[stat_index]
        body_array.push(str)
    }
    const title = '**[' + ENCHANT_TIER_NAMES[tier].toUpperCase() + ']**'
    return title + '\n' + body_array.join('\n')
}
function display_item(item, channel) {
    let embed = new RichEmbed()
        .setTitle(display_name(item))
        .setColor(TIER_COLOR[item.tier][_item_get_subtier(item)])
        .setDescription(_display_level(item) + '\n'
            + EMBED_SPACER
            + _display_stat('ATT', item.base_attack, item.bonus_attack)
            + _display_stat('STR', item.base_strength, item.bonus_strength)
            + ((item.enchant_tier !== 0) ? EMBED_SPACER + display_enchant(item.enchant_matrix, item.enchant_tier) : ''))
        .setFooter(_display_shards(item))
    channel.send(embed)
}
function _item_get_subtier(item) {
    const level_progress = item.level / max_level(item.tier)
    const star_progress = item.stars / max_star(item.tier)
    const shard_progress = item.shards / max_shard(item)
    const progress = (level_progress + star_progress + shard_progress) / 3
    return Math.floor(progress * (TIER_COLOR[item.tier].length - 1))
}

/* TODO: Stats
 * 
 */

/* Levels are pretty straight forward. They work just like weapon levels in any other game.
 * XP is gained slowly through item usage.
 * Level limit depends on tier.
 * TODO: Soften the curve if level depends on time spent using equipment.
 */
// max level 30
const XP_TABLE = [0, 50, 68, 92, 126,       // base 50, quadruple every 5 levels
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
    if (level >= XP_TABLE.length || level >= level_limit[tier]) {
        return 0
    }
    return XP_TABLE[level]
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
const STAR_RATE = [[],          // filler
    [1, 1, 1, 0.8, 0.5],        // tier 1
    [1, 1, 0.9, 0.75, 0.5, 0.3, 0.15, 0.075, 0.03, 0.01],   // tier 2
]
function max_star(tier) {
    return STAR_RATE[tier].length
}
function star_item(item) {    // returns [success, level], -1 on max star
    if (item.stars >= max_star(item.tier)) {
        return [-1, item.stars]
    }
    if (Math.random() < STAR_RATE[item.tier][item.stars]) {
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
const SHARD_LIMIT = [0, 5, 7, 8]
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
 * An enchant consists of a number of lines of stats. An enchant may have anywhere from 1 to 3 lines.
 * The main difference is that enchant_tier is limited by the item's tier.
 * The first roll is perhaps the most expensive one; a different consumable should be used to give an item its first enchant.
 * To encourage re-rolling even once you have a good roll, players are given the option to pick their previous roll.
 * Unlike in Maplestory, there aren't many garbage rolls (DEF +12%, Damage Taken -30%, etc.), so it feels like
 *   you're getting something decent every time.
 * The rarity comes in the value of the roll; unlike in Maplestory you are not guaranteed either 9% or 12% at Legendary,
 *   you are instead given a large range of values, allowing room for min/maxing. This is much like the inner ability system.
 * These stats are accounted for after all base + bonus stats are added, meaning % stats get the best bang for their buck.
 */

/* Because of how many combinations of lines in an enchant you can have, the data is best stored in a matrix.
 * The matrix is a list of lines. Each line is either a flat addition or % multiplier of one stat.
 * Lines are stored as a triplet: [0] is an index of the represented stat, [1] is a boolean of whether the stat is %,
 *   and [2] is the numerical amount.
 * Below is a mockup of a matrix.
 * 
 * [
 *   [0, 1, 5],     // Enchant 1, 5% ATT
 *   [1, 0, 20],    // Enchant 2, +20 STR
 * ]
 * 
 * You can find a mapping of indices to stats below.
 */
const STAT_NAMES = [
    'ATT',
    'STR',
]
/* Similarly, the ranges are determined in a matrix. This matrix is indexed first by enchant_tier, then by stat index,
 *   then by flat or % (0 or 1), returning a tuple containing the min and max values.
 */
const ENCHANT_RANGES = [[], // tier 0 (no enchant)
    [                       // tier 1 (common)
        [[2, 4], [1, 2]],       // ATT
        [[4, 8], [1, 2]],       // STR
    ],
    [                       // tier 2 (uncommon)
        [[3, 6], [2, 4]],       // ATT
        [[6, 12], [2, 4]],      // STR
    ],
    [                       // tier 3 (rare)
        [[5, 10], [3, 6]],      // ATT
        [[10, 20], [3, 6]],     // STR
    ],
    [                       // tier 4 (unique)
        [[8, 16], [5, 10]],     // ATT
        [[15, 30], [5, 10]],    // STR
    ],
]
const ENCHANT_TIER_NAMES = ['', 'Common', 'Uncommon', 'Rare', 'Unique']
const ENCHANT_TIER_UPGRADE_RATE = [1, 0.05, 0.035, 0.02, 0]
const ENCHANT_LINE_UPGRADE_RATE = [1, 0.1, 0.01, 0]
function max_enchant_tier(item) {
    return item.tier
}
function _generate_enchant(tier, lines) {   // should only be used by reroll and 1st enchant
    const enchant_ranges = ENCHANT_RANGES[tier]
    let enchant_matrix = []
    for (let i = 0; i < lines; i += 1) {
        const stat_index = Math.floor(Math.random() * enchant_ranges.length)
        const is_percentage = Math.floor(Math.random() * 2)
        const range = enchant_ranges[stat_index][is_percentage]
        const value = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]  // inclusive

        const line = [stat_index, is_percentage, value]
        enchant_matrix.push(line)
    }
    return enchant_matrix
}
function enchant_lines(matrix) {
    return matrix.length
}
/* The first enchant is special in two ways: firstly, it rolls for a line increase twice. This makes it the only
 *   opportunity that allows for an increase of multiple lines.
 * Secondly, the line upgrade rate is doubled.
 * The above are also true for tier upgrades.
 */
function first_enchant(item) {      // protections are in place so that this can only be called once
    if (item.enchant_tier !== 0) {
        return
    }
    let lines = 1
    if (Math.random() < ENCHANT_LINE_UPGRADE_RATE[lines] * 2) {
        lines += 1
    }
    if (Math.random() < ENCHANT_LINE_UPGRADE_RATE[lines] * 2) {
        lines += 1
    }
    let enchant_tier = 1
    if (Math.random() < ENCHANT_TIER_UPGRADE_RATE[enchant_tier] * 2) {
        enchant_tier += 1
    }
    if (Math.random() < ENCHANT_TIER_UPGRADE_RATE[enchant_tier] * 2) {
        enchant_tier += 1
    }
    const enchant_matrix = _generate_enchant(enchant_tier, lines)
    item.enchant_matrix = enchant_matrix
    item.enchant_tier = enchant_tier
    return [enchant_matrix, enchant_tier]
}
function reroll_enchant(item) {
    const old_matrix = item.enchant_matrix
    const old_enchant_tier = item.enchant_tier
    let lines = enchant_lines(old_matrix)
    if (Math.random() < ENCHANT_LINE_UPGRADE_RATE[lines]) {
        lines += 1
    }
    let enchant_tier = item.enchant_tier
    if (Math.random() < ENCHANT_TIER_UPGRADE_RATE[enchant_tier]) {
        enchant_tier += 1
    }
    const new_matrix = _generate_enchant(enchant_tier, lines)
    return [old_matrix, old_enchant_tier, new_matrix, enchant_tier]
}
function enchant_menu(item, author) {
    const [old_enchant, old_enchant_tier, new_enchant, new_enchant_tier] = reroll_enchant(item)
    const embed = new RichEmbed()
        .setTitle('Pick a new enchant below for ' + display_name(item) + '.')
        .setColor(INFO)
        .addField(REACT_ONE, display_enchant(old_enchant, old_enchant_tier))
        .addField(REACT_TWO
            + ((new_enchant_tier > old_enchant_tier || enchant_lines(new_enchant) > enchant_lines(old_enchant))
                ? ':exclamation:' : ''),
            display_enchant(new_enchant, new_enchant_tier))
    const author_id = author.id
    author.send(embed).then(message => {
        message.react(REACT_ONE)
        sleep(750)
        message.react(REACT_TWO)
        put_enchant_pending(author_id, message.id, new_enchant, new_enchant_tier)
    })
}

let enchant_pending = new Collection()
function put_enchant_pending(id, message_id, new_matrix, new_enchant_tier) {
    enchant_pending.set(id, [message_id, new_matrix, new_enchant_tier])
}
function get_enchant_pending(id) {
    return enchant_pending.get(id)
}
function has_enchant_pending(id) {
    return enchant_pending.has(id)
}
function remove_enchant_pending(id) {
    enchant_pending.delete(id)
}

let enchant_continue_pending = new Collection()
function put_enchant_continue_pending(id, message_id) {
    enchant_continue_pending.set(id, message_id)
}
function get_enchant_continue_pending(id) {
    return enchant_continue_pending.get(id)
}
function has_enchant_continue_pending(id) {
    return enchant_continue_pending.has(id)
}
function remove_enchant_continue_pending(id) {
    enchant_continue_pending.delete(id)
}

/* Unlike regular item stats, enchanted stats cannot be processed in linear fashion, adding on item's stats to 
 *   where the previous left off. This is because of how % stats are processed - they need to be done last.
 * Thus, a stat vector is compiled linearly, having entries for both % and flat versions of each stat.
 * More information can be found earlier above in the stat section.
 */

client.on('ready', () => {
    console.log('Ready.')
})

client.on('messageReactionAdd', (message_reaction, user) => {
    if (has_enchant_pending(user.id)) {
        if (!has_item(user.id)) {
            return
        }
        const [message_id, new_matrix, new_enchant_tier] = get_enchant_pending(user.id)
        if (message_reaction.message.id === message_id) {
            const item = get_item(user.id)  // they must have an item
            if (message_reaction.emoji.name === REACT_TWO) {
                remove_enchant_pending(user.id)
                item.enchant_matrix = new_matrix
                item.enchant_tier = new_enchant_tier
                const embed = new RichEmbed()
                    .setTitle('New enchantment applied to ' + display_name(item) + '.')
                    .setColor(SUCCESS)
                user.send(embed)
            } else if (message_reaction.emoji.name === REACT_ONE) {    // no change, reaction ':one:'
                remove_enchant_pending(user.id)
                const embed = new RichEmbed()
                    .setTitle('Current enchantment of ' + display_name(item) + ' preserved.')
                    .setColor(INFO)
                user.send(embed)
            }
            if ([REACT_ONE, REACT_TWO].includes(message_reaction.emoji.name)) {    // continue?
                const embed = new RichEmbed()
                    .setTitle('Continue?')
                    .setColor(INFO)
                user.send(embed).then(message => {
                    message.react(REACT_YES)
                    sleep(750)
                    message.react(REACT_NO)
                    put_enchant_continue_pending(user.id, message.id)
                })
            }
        }
    }
    if (has_enchant_continue_pending(user.id)) {
        if (!has_item(user.id)) {
            return
        }
        const message_id = get_enchant_continue_pending(user.id)
        if (message_reaction.message.id === message_id) {
            const item = get_item(user.id)  // they must have an item
            if (message_reaction.emoji.name === REACT_YES) {
                remove_enchant_continue_pending(user.id)
                enchant_menu(item, user)
            } else if (message_reaction.emoji.name === REACT_NO) {
                remove_enchant_continue_pending(user.id)
                const embed = new RichEmbed()
                    .setTitle('Enchanting complete.')
                    .setColor(INFO)
                user.send(embed)
            }
        }
    }
})

client.on('message', message => {
    if (message.author.bot || !message.channel instanceof DMChannel) {  // ignore self messages and non-PMs
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
        if (has_item(message.author.id)) {
            const embed = new RichEmbed()
                .setTitle('You already have an item! `/item` to view it.')
                .setColor(ERROR)
            message.channel.send(embed)
            return
        }
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
    if (has_enchant_pending(message.author.id)) {
        const embed = new RichEmbed()
            .setTitle('Please select an enchant before performing other actions.')
            .setColor(ERROR)
        message.channel.send(embed)
        return
    }

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
            .setTitle('Added ' + xp + 'XP to ' + display_name(item) + '.')
            .setColor(INFO)
        message.channel.send(embed)
    } else if (args[0].match(/^\/(?:show|item)$/i)) {
        display_item(item, message.channel)
    } else if (args[0].match(/^\/star$/i)) {
        const [success, level] = star_item(item)
        if (success === -1) {
            const embed = new RichEmbed()
                .setTitle(display_name(item) + ' is at max stars!')
                .setColor(INFO)
            message.channel.send(embed)
        } else if (success) {
            const embed = new RichEmbed()
                .setTitle('Successfully starred ' + display_name(item) + '!')
                .setColor(SUCCESS)
            message.channel.send(embed)
        } else {
            const embed = new RichEmbed()
                .setTitle('Failed to star ' + display_name(item) + '.')
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
            .setTitle('Starred ' + display_name(item) + ' up to **' + times + '** time(s).')
            .setColor(SUCCESS)
        message.channel.send(embed)
    } else if (args[0].match(/^\/shard$/i)) {
        const success = shard_item(item)
        if (success) {
            const embed = new RichEmbed()
                .setTitle('Sharding succeeded! ' + display_name(item) + ' has ' + item.shards_left + ' shards left.')
                .setColor(SUCCESS)
            message.channel.send(embed)
        } else {
            const embed = new RichEmbed()
                .setTitle(display_name(item) + ' is at shard capacity!')
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
            .setTitle('Sharded ' + display_name(item) + ' up to **' + times + '** time(s).')
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
            .setTitle('Maxed ' + display_name(item) + '!')
            .setColor(SUCCESS)
        message.channel.send(embed)
    } else if (args[0].match(/^\/expand$/i)) {
        const success = expand_item(item)
        if (success) {
            const embed = new RichEmbed()
                .setTitle('Expansion succeeded! ' + display_name(item) + ' has '
                    + (max_expansion(item) - item.expansions) + ' expansion(s) left.')
                .setColor(SUCCESS)
            message.channel.send(embed)
        } else {
            const embed = new RichEmbed()
                .setTitle(display_name(item) + ' can no longer be expanded.')
                .setColor(SUCCESS)
            message.channel.send(embed)
        }
    } else if (args[0].match(/^\/enchant$/i)) {
        if (item.enchant_tier === 0) {
            const [enchant_matrix, enchant_tier] = first_enchant(item)
            const embed = new RichEmbed()
                .setTitle(display_name(item) + ' has been enchanted!')
                .setColor(SUCCESS)
                .setDescription(display_enchant(enchant_matrix, enchant_tier))
            message.channel.send(embed)
        } else {
            enchant_menu(item, message.author)
        }
    }
})

// suicide proofing
client.on('error', e => console.error(e))
client.on('warn', e => console.warn(e))

client.login(token)
