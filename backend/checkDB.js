const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('tournament_stats').select('updated_at').single();
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Last updated:", data.updated_at);
        console.log("Current time:", new Date().toISOString());
    }
}
check();
