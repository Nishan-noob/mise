-- Mise DB Migration 002: Seed Data
-- ==============================================================

-- ─── Admin user (password: admin123) ─────────────────────────
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Admin', 'admin@mise.local', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'admin'),
  ('Morgan Lee', 'manager@mise.local', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'manager'),
  ('Casey Kim', 'cashier@mise.local', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'cashier'),
  ('Jordan Chen', 'kitchen@mise.local', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'kitchen')
ON CONFLICT (email) DO NOTHING;

-- ─── Tables ──────────────────────────────────────────────────
INSERT INTO restaurant_tables (name, capacity, floor) VALUES
  ('T1', 2, 'main'), ('T2', 2, 'main'), ('T3', 4, 'main'), ('T4', 4, 'main'),
  ('T5', 4, 'main'), ('T6', 6, 'main'), ('T7', 6, 'main'), ('T8', 8, 'main'),
  ('Bar 1', 2, 'bar'), ('Bar 2', 2, 'bar'), ('Bar 3', 2, 'bar'),
  ('Patio 1', 4, 'patio'), ('Patio 2', 4, 'patio'), ('Patio 3', 6, 'patio')
ON CONFLICT (name) DO NOTHING;

-- ─── Menu Categories ─────────────────────────────────────────
INSERT INTO menu_categories (name, station, sort_order) VALUES
  ('Starters', 'cold', 1),
  ('Soups & Salads', 'cold', 2),
  ('Mains', 'grill', 3),
  ('Burgers', 'grill', 4),
  ('Sides', 'fry', 5),
  ('Desserts', 'pastry', 6),
  ('Non-Alcoholic', 'bar', 7),
  ('Cocktails', 'bar', 8),
  ('Beer & Wine', 'bar', 9)
ON CONFLICT (name) DO NOTHING;

-- ─── Menu Items ──────────────────────────────────────────────
INSERT INTO menu_items (category_id, name, description, price) VALUES
  -- Starters
  ((SELECT id FROM menu_categories WHERE name='Starters'), 'Bruschetta', 'Grilled bread with tomatoes, garlic & basil', 8.50),
  ((SELECT id FROM menu_categories WHERE name='Starters'), 'Calamari', 'Crispy fried squid with aioli', 12.00),
  ((SELECT id FROM menu_categories WHERE name='Starters'), 'Chicken Wings', '6 pieces with choice of sauce', 13.50),
  ((SELECT id FROM menu_categories WHERE name='Starters'), 'Cheese Board', 'Seasonal selection with crackers', 16.00),

  -- Soups & Salads
  ((SELECT id FROM menu_categories WHERE name='Soups & Salads'), 'Caesar Salad', 'Romaine, parmesan, croutons, caesar dressing', 14.00),
  ((SELECT id FROM menu_categories WHERE name='Soups & Salads'), 'Greek Salad', 'Tomato, cucumber, olives, feta', 13.00),
  ((SELECT id FROM menu_categories WHERE name='Soups & Salads'), 'French Onion Soup', 'Classic with gruyère crust', 11.00),

  -- Mains
  ((SELECT id FROM menu_categories WHERE name='Mains'), 'Grilled Salmon', '200g Atlantic salmon with lemon butter', 26.00),
  ((SELECT id FROM menu_categories WHERE name='Mains'), 'Ribeye Steak', '300g grain-fed with choice of sauce', 42.00),
  ((SELECT id FROM menu_categories WHERE name='Mains'), 'Chicken Parma', 'Crumbed chicken, napolitana, mozzarella', 22.00),
  ((SELECT id FROM menu_categories WHERE name='Mains'), 'Mushroom Risotto', 'Wild mushrooms, parmesan, truffle oil', 20.00),
  ((SELECT id FROM menu_categories WHERE name='Mains'), 'Fish & Chips', 'Beer-battered barramundi with tartare', 19.00),

  -- Burgers
  ((SELECT id FROM menu_categories WHERE name='Burgers'), 'Classic Cheeseburger', 'Beef patty, cheddar, pickles, special sauce', 18.00),
  ((SELECT id FROM menu_categories WHERE name='Burgers'), 'Bacon Avocado Burger', 'Beef, bacon, avo, chipotle mayo', 21.00),
  ((SELECT id FROM menu_categories WHERE name='Burgers'), 'Crispy Chicken Burger', 'Buttermilk fried chicken, slaw, hot sauce', 19.00),
  ((SELECT id FROM menu_categories WHERE name='Burgers'), 'Veggie Burger', 'Black bean patty, halloumi, rocket', 17.00),

  -- Sides
  ((SELECT id FROM menu_categories WHERE name='Sides'), 'Fries', 'Crispy shoestring fries', 6.00),
  ((SELECT id FROM menu_categories WHERE name='Sides'), 'Sweet Potato Fries', 'With chipotle dipping sauce', 7.50),
  ((SELECT id FROM menu_categories WHERE name='Sides'), 'Garden Salad', 'Mixed leaves, cherry tomatoes', 6.00),
  ((SELECT id FROM menu_categories WHERE name='Sides'), 'Onion Rings', 'Beer-battered, with ranch', 7.00),
  ((SELECT id FROM menu_categories WHERE name='Sides'), 'Coleslaw', 'House made', 5.00),

  -- Desserts
  ((SELECT id FROM menu_categories WHERE name='Desserts'), 'Chocolate Lava Cake', 'With vanilla bean ice cream', 12.00),
  ((SELECT id FROM menu_categories WHERE name='Desserts'), 'Crème Brûlée', 'Classic vanilla custard', 11.00),
  ((SELECT id FROM menu_categories WHERE name='Desserts'), 'Cheesecake', 'New York style with berry compote', 10.00),
  ((SELECT id FROM menu_categories WHERE name='Desserts'), 'Ice Cream', '3 scoops, choice of flavour', 9.00),

  -- Non-Alcoholic
  ((SELECT id FROM menu_categories WHERE name='Non-Alcoholic'), 'Soft Drink', 'Coke, Lemonade, Orange', 4.00),
  ((SELECT id FROM menu_categories WHERE name='Non-Alcoholic'), 'Juice', 'Orange, Apple, Mango', 5.00),
  ((SELECT id FROM menu_categories WHERE name='Non-Alcoholic'), 'Sparkling Water', '500ml', 4.00),
  ((SELECT id FROM menu_categories WHERE name='Non-Alcoholic'), 'Flat White', 'Double shot espresso with steamed milk', 5.00),
  ((SELECT id FROM menu_categories WHERE name='Non-Alcoholic'), 'Mocktail of the Day', 'Ask your server', 8.00),

  -- Cocktails
  ((SELECT id FROM menu_categories WHERE name='Cocktails'), 'Old Fashioned', 'Bourbon, bitters, orange peel', 16.00),
  ((SELECT id FROM menu_categories WHERE name='Cocktails'), 'Aperol Spritz', 'Aperol, prosecco, soda', 14.00),
  ((SELECT id FROM menu_categories WHERE name='Cocktails'), 'Mojito', 'Rum, lime, mint, soda', 15.00),
  ((SELECT id FROM menu_categories WHERE name='Cocktails'), 'Negroni', 'Gin, campari, vermouth', 17.00),
  ((SELECT id FROM menu_categories WHERE name='Cocktails'), 'Espresso Martini', 'Vodka, coffee liqueur, espresso', 16.00),

  -- Beer & Wine
  ((SELECT id FROM menu_categories WHERE name='Beer & Wine'), 'Draught Beer', 'House lager, pint', 9.00),
  ((SELECT id FROM menu_categories WHERE name='Beer & Wine'), 'Craft IPA', '500ml can', 10.00),
  ((SELECT id FROM menu_categories WHERE name='Beer & Wine'), 'House White Wine', '150ml glass', 10.00),
  ((SELECT id FROM menu_categories WHERE name='Beer & Wine'), 'House Red Wine', '150ml glass', 10.00),
  ((SELECT id FROM menu_categories WHERE name='Beer & Wine'), 'Prosecco', '150ml glass', 12.00)
ON CONFLICT DO NOTHING;

-- ─── Modifier Groups & Modifiers ──────────────────────────────
-- Steak sauces
INSERT INTO modifier_groups (menu_item_id, name, required, min_select, max_select) VALUES
  ((SELECT id FROM menu_items WHERE name='Ribeye Steak'), 'Sauce', TRUE, 1, 1),
  ((SELECT id FROM menu_items WHERE name='Ribeye Steak'), 'Doneness', TRUE, 1, 1),
  ((SELECT id FROM menu_items WHERE name='Chicken Wings'), 'Wing Sauce', TRUE, 1, 1),
  ((SELECT id FROM menu_items WHERE name='Classic Cheeseburger'), 'Add-ons', FALSE, 0, 3),
  ((SELECT id FROM menu_items WHERE name='Classic Cheeseburger'), 'Bun', FALSE, 0, 1),
  ((SELECT id FROM menu_items WHERE name='Fries'), 'Style', FALSE, 0, 1),
  ((SELECT id FROM menu_items WHERE name='Soft Drink'), 'Flavour', TRUE, 1, 1)
ON CONFLICT DO NOTHING;

INSERT INTO modifiers (modifier_group_id, name, price_delta) VALUES
  ((SELECT id FROM modifier_groups WHERE name='Sauce' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Ribeye Steak')), 'Peppercorn', 0),
  ((SELECT id FROM modifier_groups WHERE name='Sauce' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Ribeye Steak')), 'Mushroom', 0),
  ((SELECT id FROM modifier_groups WHERE name='Sauce' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Ribeye Steak')), 'Red Wine Jus', 0),
  ((SELECT id FROM modifier_groups WHERE name='Doneness' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Ribeye Steak')), 'Rare', 0),
  ((SELECT id FROM modifier_groups WHERE name='Doneness' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Ribeye Steak')), 'Medium Rare', 0),
  ((SELECT id FROM modifier_groups WHERE name='Doneness' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Ribeye Steak')), 'Medium', 0),
  ((SELECT id FROM modifier_groups WHERE name='Doneness' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Ribeye Steak')), 'Well Done', 0),
  ((SELECT id FROM modifier_groups WHERE name='Wing Sauce' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Chicken Wings')), 'Buffalo Hot', 0),
  ((SELECT id FROM modifier_groups WHERE name='Wing Sauce' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Chicken Wings')), 'BBQ', 0),
  ((SELECT id FROM modifier_groups WHERE name='Wing Sauce' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Chicken Wings')), 'Honey Soy', 0),
  ((SELECT id FROM modifier_groups WHERE name='Add-ons' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Classic Cheeseburger')), 'Extra Patty', 5.00),
  ((SELECT id FROM modifier_groups WHERE name='Add-ons' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Classic Cheeseburger')), 'Bacon', 3.00),
  ((SELECT id FROM modifier_groups WHERE name='Add-ons' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Classic Cheeseburger')), 'Avocado', 2.50),
  ((SELECT id FROM modifier_groups WHERE name='Bun' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Classic Cheeseburger')), 'GF Bun', 2.00),
  ((SELECT id FROM modifier_groups WHERE name='Style' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Fries')), 'Loaded (cheese + bacon)', 4.00),
  ((SELECT id FROM modifier_groups WHERE name='Flavour' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Soft Drink')), 'Coke', 0),
  ((SELECT id FROM modifier_groups WHERE name='Flavour' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Soft Drink')), 'Diet Coke', 0),
  ((SELECT id FROM modifier_groups WHERE name='Flavour' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Soft Drink')), 'Lemonade', 0),
  ((SELECT id FROM modifier_groups WHERE name='Flavour' AND menu_item_id=(SELECT id FROM menu_items WHERE name='Soft Drink')), 'Orange', 0)
ON CONFLICT DO NOTHING;

-- ─── Inventory ────────────────────────────────────────────────
INSERT INTO inventory_items (name, unit, quantity, low_stock_threshold) VALUES
  ('Beef Patty 150g', 'pcs', 120, 20),
  ('Chicken Breast', 'kg', 15, 3),
  ('Salmon Fillet', 'kg', 8, 2),
  ('Ribeye Steak 300g', 'pcs', 30, 5),
  ('Burger Bun', 'pcs', 100, 20),
  ('Cheddar Cheese', 'kg', 5, 1),
  ('Bacon', 'kg', 4, 1),
  ('Romaine Lettuce', 'kg', 6, 1),
  ('Tomatoes', 'kg', 8, 2),
  ('Fries', 'kg', 20, 5),
  ('Sweet Potato', 'kg', 10, 3),
  ('Flour', 'kg', 25, 5),
  ('Eggs', 'doz', 10, 2),
  ('Butter', 'kg', 5, 1),
  ('Cream', 'L', 8, 2),
  ('Vodka', 'L', 6, 1),
  ('Rum', 'L', 5, 1),
  ('Bourbon', 'L', 4, 1),
  ('Gin', 'L', 4, 1),
  ('Beer Keg', 'keg', 4, 1),
  ('House White Wine', 'bottle', 24, 6),
  ('House Red Wine', 'bottle', 24, 6),
  ('Prosecco', 'bottle', 12, 3),
  ('Coffee Beans', 'kg', 3, 0.5)
ON CONFLICT (name) DO NOTHING;

-- ─── Recipe Ingredients ───────────────────────────────────────
INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, quantity_per_unit) VALUES
  ((SELECT id FROM menu_items WHERE name='Classic Cheeseburger'), (SELECT id FROM inventory_items WHERE name='Beef Patty 150g'), 1),
  ((SELECT id FROM menu_items WHERE name='Classic Cheeseburger'), (SELECT id FROM inventory_items WHERE name='Burger Bun'), 1),
  ((SELECT id FROM menu_items WHERE name='Classic Cheeseburger'), (SELECT id FROM inventory_items WHERE name='Cheddar Cheese'), 0.05),
  ((SELECT id FROM menu_items WHERE name='Bacon Avocado Burger'), (SELECT id FROM inventory_items WHERE name='Beef Patty 150g'), 1),
  ((SELECT id FROM menu_items WHERE name='Bacon Avocado Burger'), (SELECT id FROM inventory_items WHERE name='Burger Bun'), 1),
  ((SELECT id FROM menu_items WHERE name='Bacon Avocado Burger'), (SELECT id FROM inventory_items WHERE name='Bacon'), 0.08),
  ((SELECT id FROM menu_items WHERE name='Ribeye Steak'), (SELECT id FROM inventory_items WHERE name='Ribeye Steak 300g'), 1),
  ((SELECT id FROM menu_items WHERE name='Grilled Salmon'), (SELECT id FROM inventory_items WHERE name='Salmon Fillet'), 0.2),
  ((SELECT id FROM menu_items WHERE name='Chicken Parma'), (SELECT id FROM inventory_items WHERE name='Chicken Breast'), 0.25),
  ((SELECT id FROM menu_items WHERE name='Caesar Salad'), (SELECT id FROM inventory_items WHERE name='Romaine Lettuce'), 0.15),
  ((SELECT id FROM menu_items WHERE name='Fries'), (SELECT id FROM inventory_items WHERE name='Fries'), 0.2),
  ((SELECT id FROM menu_items WHERE name='Sweet Potato Fries'), (SELECT id FROM inventory_items WHERE name='Sweet Potato'), 0.25),
  ((SELECT id FROM menu_items WHERE name='Old Fashioned'), (SELECT id FROM inventory_items WHERE name='Bourbon'), 0.06),
  ((SELECT id FROM menu_items WHERE name='Mojito'), (SELECT id FROM inventory_items WHERE name='Rum'), 0.05),
  ((SELECT id FROM menu_items WHERE name='Espresso Martini'), (SELECT id FROM inventory_items WHERE name='Vodka'), 0.05),
  ((SELECT id FROM menu_items WHERE name='Espresso Martini'), (SELECT id FROM inventory_items WHERE name='Coffee Beans'), 0.01),
  ((SELECT id FROM menu_items WHERE name='Negroni'), (SELECT id FROM inventory_items WHERE name='Gin'), 0.03),
  ((SELECT id FROM menu_items WHERE name='Draught Beer'), (SELECT id FROM inventory_items WHERE name='Beer Keg'), 0.01),
  ((SELECT id FROM menu_items WHERE name='House White Wine'), (SELECT id FROM inventory_items WHERE name='House White Wine'), 0.2),
  ((SELECT id FROM menu_items WHERE name='House Red Wine'), (SELECT id FROM inventory_items WHERE name='House Red Wine'), 0.2),
  ((SELECT id FROM menu_items WHERE name='Prosecco'), (SELECT id FROM inventory_items WHERE name='Prosecco'), 0.2),
  ((SELECT id FROM menu_items WHERE name='Flat White'), (SELECT id FROM inventory_items WHERE name='Coffee Beans'), 0.02),
  ((SELECT id FROM menu_items WHERE name='Flat White'), (SELECT id FROM inventory_items WHERE name='Cream'), 0.15)
ON CONFLICT (menu_item_id, inventory_item_id) DO NOTHING;
