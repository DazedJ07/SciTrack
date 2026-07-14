# SciTrack

> **SCITRACK: THE DEVELOPMENT OF AN RFID-BASED BORROWING SYSTEM FOR SCIENCE LABORATORY EQUIPMENT AT DE LA SALLE UNIVERSITY - DASMARIÑAS SENIOR HIGH SCHOOL**
> 
> *A proprietary inventory management and borrowing system utilizing RFID technology, customized for the DLSU-D Senior High School Science Laboratory.*

---

## 🔒 Proprietary Property Notice
This project is **Strictly the Property of Medina et al.** and represents the codebase developed for the Senior High School Research Project at De La Salle University - Dasmariñas. All rights reserved.

### Researchers & Authors (Medina et al.)
- **Wagwag, Stephanie Lourese**
- **Medina, Jian Carlos**
- **Mercado, Gilliana Grace**
- **Onofre, Luna Simonne**
- **Pradas, James Maynard**
- **Santos, Ezekiel Zach**
- **Zabala, Jaime JR**

---

## 📖 Citation (APA 7th Edition)
To cite this research paper or software, please use the following APA format:

```text
Wagwag, S. L., Medina, J. C., Mercado, G. G., Onofre, L. S., Pradas, J. M., Santos, E. Z., & Zabala, J. (2026). SciTrack: The development of an RFID-based borrowing system for science laboratory equipment at De La Salle University - Dasmariñas Senior High School (Unpublished manuscript). De La Salle University - Dasmariñas Senior High School.
```

---

## 🚀 Setup & Getting Started

To run this application locally, you must supply your own Supabase and EmailJS configuration. 

### 1. Configure Credentials
Due to security best practices, the database keys and service tokens have been removed from the tracked source code. You will need to create a local configuration file:

1. Locate `config.example.js` in the `SciTrack` directory.
2. Duplicate or rename it to `config.js` (this file is excluded from Git to prevent exposing credentials).
3. Open `config.js` and input your Supabase credentials and EmailJS public key:

```javascript
window.SUPABASE_URL = 'https://your-supabase-project.supabase.co';
window.SUPABASE_KEY = 'your-anon-or-service-key';
window.EMAILJS_PUBLIC_KEY = 'your-emailjs-public-key';
```

### 2. Database Schema
To initialize the Supabase tables, refer to the queries listed in `z notes` inside the `SciTrack` directory. These queries set up the necessary relational tables for tracking loans, inventory items, administrator activities, and student accounts.

### 3. Launching the App
Simply open the `SciTrack/index.html` file in any modern web browser. No compilation or server installation is required.

---

## 📄 License
This codebase is proprietary and confidential. For terms and conditions of usage, reproduction, and distribution, please refer to the accompanying [LICENSE](LICENSE) file. Unauthorized use or reproduction is strictly prohibited.
