const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
    const url = 'https://www.espncricinfo.com/series/ipl-2026-1510719/squads';
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(response.data);
    let links = [];
    $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href && href.includes('mumbai')) {
            links.push(href);
        }
    });
    
    console.log(links);
}

check();
