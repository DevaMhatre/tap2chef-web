import type { Diet } from "./menu";

// What a new owner picks from instead of typing a menu from nothing. Names
// only, never prices: a price we guessed would quietly charge the wrong
// amount. The diet comes with the name ("Chicken Biryani"). Anything baked
// that usually has egg in it is marked egg: wrongly marked veg is the mistake
// a vegetarian guest can't forgive. A first draft, to be corrected by real
// owners.

export type StarterDish = { name: string; diet: Diet };
export type StarterSection = { category: string; dishes: StarterDish[] };
export type StarterMenu = { id: string; label: string; sections: StarterSection[] };

const veg = (...names: string[]): StarterDish[] => names.map((name) => ({ name, diet: "veg" }));
const nonVeg = (...names: string[]): StarterDish[] => names.map((name) => ({ name, diet: "nonVeg" }));
const egg = (...names: string[]): StarterDish[] => names.map((name) => ({ name, diet: "egg" }));

export const STARTER_MENUS: readonly StarterMenu[] = [
  {
    id: "biryani",
    label: "Biryani & meals",
    sections: [
      { category: "Biryani", dishes: [...nonVeg("Chicken Biryani", "Mutton Biryani"), ...egg("Egg Biryani"), ...veg("Veg Biryani", "Paneer Biryani")] },
      { category: "Starters", dishes: [...nonVeg("Chicken 65", "Chicken Tikka", "Chicken Lollipop"), ...veg("Paneer Tikka")] },
      {
        category: "Curries",
        dishes: [...nonVeg("Butter Chicken", "Chicken Curry", "Mutton Curry"), ...egg("Egg Curry"), ...veg("Paneer Butter Masala", "Dal Tadka", "Dal Makhani")],
      },
      { category: "Rice & Breads", dishes: veg("Jeera Rice", "Steamed Rice", "Tandoori Roti", "Butter Naan", "Chapati") },
      { category: "Thali", dishes: [...veg("Veg Thali"), ...nonVeg("Chicken Thali")] },
      { category: "Drinks", dishes: veg("Sweet Lassi", "Masala Chaas", "Cold Drink", "Mineral Water") },
    ],
  },
  {
    id: "southIndian",
    label: "South Indian",
    sections: [
      { category: "Dosa", dishes: veg("Plain Dosa", "Masala Dosa", "Mysore Masala Dosa", "Rava Dosa", "Set Dosa", "Onion Uttapam") },
      { category: "Idli & Vada", dishes: veg("Idli (2 pcs)", "Medu Vada (2 pcs)", "Idli Vada", "Sambar Vada", "Upma", "Pongal") },
      { category: "Rice", dishes: veg("South Indian Thali", "Curd Rice", "Lemon Rice", "Sambar Rice") },
      { category: "Drinks", dishes: veg("Filter Coffee", "Tea", "Badam Milk", "Buttermilk") },
    ],
  },
  {
    id: "cafe",
    label: "Café & bakery",
    sections: [
      { category: "Hot Drinks", dishes: veg("Espresso", "Americano", "Cappuccino", "Café Latte", "Hot Chocolate", "Masala Chai") },
      { category: "Cold Drinks", dishes: veg("Cold Coffee", "Iced Latte", "Lemon Iced Tea", "Chocolate Shake", "Fresh Lime Soda") },
      {
        category: "Food",
        dishes: [...veg("Veg Sandwich", "Grilled Cheese Sandwich", "Garlic Bread", "French Fries", "Veg Burger"), ...nonVeg("Chicken Sandwich")],
      },
      { category: "Bakery", dishes: egg("Chocolate Brownie", "Blueberry Muffin", "Butter Croissant", "Chocolate Cake (slice)") },
    ],
  },
  {
    id: "fastFood",
    label: "Fast food & Chinese",
    sections: [
      {
        category: "Burgers & Fries",
        dishes: [...veg("Veg Burger", "Paneer Burger"), ...nonVeg("Chicken Burger"), ...veg("Margherita Pizza", "French Fries", "Peri Peri Fries")],
      },
      { category: "Rolls", dishes: [...veg("Veg Frankie", "Paneer Roll"), ...egg("Egg Roll"), ...nonVeg("Chicken Roll")] },
      {
        category: "Chinese",
        dishes: [
          ...veg("Veg Fried Rice"),
          ...egg("Egg Fried Rice"),
          ...nonVeg("Chicken Fried Rice"),
          ...veg("Veg Hakka Noodles", "Schezwan Noodles"),
          ...nonVeg("Chicken Hakka Noodles"),
          ...veg("Veg Manchurian", "Chilli Paneer"),
          ...nonVeg("Chilli Chicken"),
          ...veg("Veg Momos"),
          ...nonVeg("Chicken Momos"),
        ],
      },
      { category: "Drinks", dishes: veg("Cold Drink", "Mineral Water") },
    ],
  },
  {
    id: "sweets",
    label: "Sweets & snacks",
    sections: [
      {
        category: "Snacks",
        dishes: veg("Samosa", "Kachori", "Vada Pav", "Pav Bhaji", "Misal Pav", "Dhokla", "Poha", "Aloo Tikki", "Chole Bhature"),
      },
      { category: "Chaat", dishes: veg("Pani Puri", "Bhel Puri", "Sev Puri", "Dahi Puri") },
      { category: "Sweets", dishes: veg("Gulab Jamun", "Rasgulla", "Rasmalai", "Jalebi", "Gajar Halwa", "Kaju Katli (250 g)") },
      { category: "Drinks", dishes: veg("Masala Chai", "Sweet Lassi", "Badam Milk") },
    ],
  },
];
