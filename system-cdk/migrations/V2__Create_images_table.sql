CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    uuid_filename VARCHAR(36) NOT NULL UNIQUE,
    image_name VARCHAR(40) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_images_username 
        FOREIGN KEY (username) 
        REFERENCES users(username)
        ON DELETE CASCADE
);

-- Create index on username for better query performance
CREATE INDEX IF NOT EXISTS idx_images_username ON images(username);
