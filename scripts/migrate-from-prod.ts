import { neon } from '@neondatabase/serverless';

const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_MvS2WkGtKlf6@ep-curly-darkness-af8ayl2o.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DATABASE_URL = process.env.DATABASE_URL!;

async function migrate() {
  console.log('🚀 Starting migration from production to development...\n');
  
  const prodDb = neon(PROD_DATABASE_URL);
  const devDb = neon(DEV_DATABASE_URL);
  
  try {
    // 1. Migrate tags
    console.log('📦 Fetching tags from production...');
    const prodTags = await prodDb`SELECT * FROM tags`;
    console.log(`   Found ${prodTags.length} tags in production`);
    
    if (prodTags.length > 0) {
      console.log('   Inserting tags into development...');
      for (const tag of prodTags) {
        try {
          await devDb`
            INSERT INTO tags (id, slug, name, description, category, created_at, updated_at)
            VALUES (${tag.id}, ${tag.slug}, ${tag.name}, ${tag.description}, ${tag.category}, ${tag.created_at}, ${tag.updated_at})
            ON CONFLICT (id) DO UPDATE SET
              slug = EXCLUDED.slug,
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              category = EXCLUDED.category,
              updated_at = EXCLUDED.updated_at
          `;
        } catch (err: any) {
          if (err.message?.includes('duplicate key')) {
            console.log(`   ⚠️  Tag "${tag.name}" already exists, updating...`);
          } else {
            throw err;
          }
        }
      }
      console.log(`   ✅ Tags migrated successfully\n`);
    }
    
    // 2. Migrate articles
    console.log('📄 Fetching articles from production...');
    const prodArticles = await prodDb`SELECT * FROM articles`;
    console.log(`   Found ${prodArticles.length} articles in production`);
    
    if (prodArticles.length > 0) {
      console.log('   Inserting articles into development...');
      for (const article of prodArticles) {
        try {
          await devDb`
            INSERT INTO articles (id, slug, preview, content, is_free, created_at, updated_at)
            VALUES (${article.id}, ${article.slug}, ${article.preview}, ${article.content}, ${article.is_free}, ${article.created_at}, ${article.updated_at})
            ON CONFLICT (id) DO UPDATE SET
              slug = EXCLUDED.slug,
              preview = EXCLUDED.preview,
              content = EXCLUDED.content,
              is_free = EXCLUDED.is_free,
              updated_at = EXCLUDED.updated_at
          `;
        } catch (err: any) {
          if (err.message?.includes('duplicate key')) {
            console.log(`   ⚠️  Article "${article.slug}" already exists, updating...`);
          } else {
            throw err;
          }
        }
      }
      console.log(`   ✅ Articles migrated successfully\n`);
    }
    
    // 3. Migrate article_tags relationships
    console.log('🔗 Fetching article-tag relationships from production...');
    const prodArticleTags = await prodDb`SELECT * FROM article_tags`;
    console.log(`   Found ${prodArticleTags.length} relationships in production`);
    
    if (prodArticleTags.length > 0) {
      console.log('   Inserting relationships into development...');
      for (const at of prodArticleTags) {
        try {
          await devDb`
            INSERT INTO article_tags (article_id, tag_id, created_at)
            VALUES (${at.article_id}, ${at.tag_id}, ${at.created_at})
            ON CONFLICT ON CONSTRAINT article_tags_unique DO NOTHING
          `;
        } catch (err: any) {
          if (!err.message?.includes('duplicate key') && !err.message?.includes('already exists')) {
            throw err;
          }
        }
      }
      console.log(`   ✅ Article-tag relationships migrated successfully\n`);
    }
    
    console.log('🎉 Migration completed successfully!');
    
    // Summary
    const devTags = await devDb`SELECT COUNT(*) as count FROM tags`;
    const devArticles = await devDb`SELECT COUNT(*) as count FROM articles`;
    const devArticleTags = await devDb`SELECT COUNT(*) as count FROM article_tags`;
    
    console.log('\n📊 Development database summary:');
    console.log(`   Tags: ${devTags[0].count}`);
    console.log(`   Articles: ${devArticles[0].count}`);
    console.log(`   Article-tag relationships: ${devArticleTags[0].count}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
