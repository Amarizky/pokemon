import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';
import express from 'express';
import dateFormat from 'dateformat';
import bodyParser from 'body-parser';
import ejs from 'ejs';

const app = express();

const toTitleCase = (str, dash = false) => {
    if (dash) str = str.replace(/-/g, ' ');
    return str.replace(
        /\w*/g,
        (word) => (/\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()));
}
const log = (msg) => {
    console.log('[' + dateFormat(new Date(), 'HH:MM:ss.l') + '] ' + msg);
}

const uri = 'mongodb://localhost:27017/';
const client = new MongoClient(uri);
const db = client.db('pokemondb');

db.listCollections({ name: 'Pokemon' })
    .next(async (err, collInfo) => {
        // if 'pokemon' collection doesn't exist
        if (!collInfo) {
            log('Pokemon data not found.');
            log('Fetching and inserting pokemon data to collections...');
            await fetch('https://pokeapi.co/api/v2/pokemon?limit=50')
                .then(res => res.json())
                .then((data) => {
                    data.results.forEach(poke => {
                        fetch(poke.url)
                            .then(res => res.json())
                            .then(async (data) => {
                                const encounters = await fetch(data.location_area_encounters).then(res => res.json());
                                const abilities = [];

                                for (const [key, ab] of Object.entries(data.abilities)) {
                                    const ab_fetch = await fetch(ab.ability.url).then(res => res.json());
                                    const ability = {
                                        'name': toTitleCase(ab_fetch.name, true),
                                        'effect': ab_fetch.effect_entries.filter((e) => {
                                            return e.language.name == 'en';
                                        })[0].effect,
                                    };
                                    abilities.push(ability);
                                }

                                // Inserting Pokemon data to 'Pokemon' collection
                                const doc = {
                                    // Required data
                                    'id': toTitleCase(data.name),
                                    'name': toTitleCase(data.name),
                                    'types': data.types.map((t) => toTitleCase(t.type.name)),
                                    'abilities': abilities,
                                    'moves': data.moves.map((m) => toTitleCase(m.move.name, true)),
                                    'species': toTitleCase(data.species.name),
                                    // Additional data
                                    'img': data.sprites.front_default,
                                    'weight': data.weight,
                                    'encounters': encounters.map((e) => toTitleCase(e.location_area.name, true)),
                                    'stats': {
                                        'hp': data.stats[0].base_stat,
                                        'attack': data.stats[1].base_stat,
                                        'defense': data.stats[2].base_stat,
                                        'special_attack': data.stats[3].base_stat,
                                        'special_defense': data.stats[4].base_stat,
                                        'speed': data.stats[5].base_stat,
                                    },
                                };
                                await db.collection('Pokemon').insertOne(doc);

                                // Inserting Pokemon data to each of this Pokemon types collection
                                await data.types.forEach(type => {
                                    db.collection(toTitleCase(type.type.name)).insertOne(doc);
                                });
                            })
                    });
                })
            log('Done.');
        } else {
            log('Pokemon data already exist, skip fetching process.')
        }
    })


app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('public'));
app.set('views', 'public');
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');

app.get('/', (req, res) => {
    res.render('index.html');
});
app.get('/types', (req, res) => {
    res.render('grouped_by_type.html');
});

app.get('/get_pokemon', (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    const search = req.query.search ? {
        'name': {
            $regex: req.query.search,
            $options: 'i',
        },
    } : null;

    db.collection((req.query.type === 'All' ? 'Pokemon' : req.query.type) || 'Pokemon')
        .find(search)
        .collation({
            locale: 'en',
            strength: 2
        })
        .sort({ 'name': req.query.sort == 'desc' ? -1 : 1 })
        .toArray((err, result) => {
            res.jsonp(result);
        });
});

app.listen(3000, () => {
    log("Server running at http://localhost:3000/");
});
