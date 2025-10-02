# TelDirectory - Corporate Phone Directory

TelDirectory is a Next.js web application designed to manage and display a corporate phone directory. It reads directory data from XML files, allowing users to navigate through zones, branches (for specific zones like "Zona Metropolitana"), and localities to find phone extensions. The application serves both the web interface and the XML files from a single Next.js instance, removing the need for a separate web server like Nginx. Administrative features like XML import, data modification, and settings are protected by a robust, session-based authentication system backed by an SQLite database.

## Core Features:

*   **Hierarchical Directory**: Navigate through Zones, Branches (where applicable), and Localities.
*   **Unified Server**: The Next.js application serves both the web UI and the Cisco IP Phone XML files directly from the `public` directory, simplifying deployment.
*   **Extension Listing**: View department/contact names and their phone extensions. Extension numbers are clickable (`tel:` links) to initiate calls via system-configured telephony apps.
*   **Global Search**: A search bar on the homepage allows users to quickly find departments (localities) by name, or specific extensions by their name/role or number, across the entire directory.
*   **Robust Authentication**:
    *   A login page (`/login`) protects all administrative functionalities.
    *   Default administrator credentials: `admin` / `admin123` (this password should be changed in a real environment).
    *   User data is stored securely in an SQLite database (`teldirectory.db`).
    *   Session state is reliably managed across server and client using React Context, preventing inconsistencies after login.
*   **Data Management (Authenticated Users Only)**:
    *   Import extensions via CSV file.
    *   Synchronize extension names from one or more external XML feeds (e.g., from FreePBX PHP scripts).
    *   Add, edit, and delete zones, branches, localities, and extensions directly through the web UI.
*   **Customization & Configuration**:
    *   Dark Mode support (toggle in header and Settings).
    *   Language toggle (English/Español - toggle in header and Settings).
    *   **Configurable Host and Port for IP Phones** (via Settings page): Define the network address for your application, and the system will automatically rewrite the URLs within the XML files to ensure IP phones can reach the directory.

## Project Structure

*   `src/app/`: Contains the Next.js App Router pages.
    *   `src/app/[zoneId]/...`: Dynamic routes for displaying zone, branch, and locality pages.
    *   `src/app/import-xml/`: Page for settings, CSV import, XML feed sync, and application configuration (protected).
    *   `src/app/login/`: Login page.
*   `src/components/`: Reusable React components.
*   `src/lib/`: Core logic, data fetching utilities (`data.ts`), server actions (`actions.ts`), authentication (`auth-actions.ts`), and database (`db.ts`).
*   `src/context/`: React context for managing authentication (`AuthContext`) and language (`LanguageContext`).
*   `public/`: Contains static assets, including the critical `ivoxsdir` directory.
    *   `public/ivoxsdir/`: **The required directory for all XML data.**
        *   `MainMenu.xml`: The root XML file for the directory structure.
        *   `zonebranch/`: Contains XML files for each zone (e.g., `ZonaEste.xml`).
        *   `branch/`: Contains XML files for branches (e.g., `EdificioAdmCorporativo.xml`).
        *   `department/`: Contains XML files for each locality/department, listing extensions (e.g., `Bavaro.xml`).
*   `teldirectory.db`: SQLite database file created in the project root (should be added to `.gitignore`). Stores user credentials.
*   `next.config.ts`: Next.js configuration, crucial for telling the production server how to handle native packages like `sqlite3`.

## Setup and Installation

### Prerequisites

*   Node.js (v18.x or later recommended)
*   npm or yarn

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-name>
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```
This will install Next.js, React, ShadCN components, Tailwind, SQLite, bcrypt, and other necessary packages.

### 3. `public/ivoxsdir` Directory Setup

The application relies on XML files for its directory data. These files **must** be placed inside the `public/ivoxsdir` directory.

*   **Create the `ivoxsdir` directory inside `public`** if it doesn't exist.
*   Inside `public/ivoxsdir`, create the following subdirectories:
    *   `zonebranch`
    *   `branch`
    *   `department`
*   **Populate with XML files**:
    *   Place your `MainMenu.xml` file in `public/ivoxsdir`.
    *   Place your zone-specific XML files (e.g., `ZonaEste.xml`) in `public/ivoxsdir/zonebranch/`.
    *   Place your branch-specific XML files in `public/ivoxsdir/branch/`.
    *   Place your department/locality XML files (listing extensions) in `public/ivoxsdir/department/`.

    *The project may include sample XML files in a root `IVOXS` directory. You should copy or move these into `public/ivoxsdir` and adapt them to your needs.*

### 4. Database Setup (SQLite)

*   The application uses an SQLite database (`teldirectory.db`) to store user credentials.
*   This file will be **automatically created in your project root** the first time you run the application.
*   An initial administrator user will be seeded with credentials:
    *   Username: `admin`
    *   Password: `admin123`
    **It is strongly recommended to change this password in a real environment.**
*   **Add `teldirectory.db` to `.gitignore`**:
    ```
    # .gitignore
    teldirectory.db
    teldirectory.db-journal
    *.db-shm
    *.db-wal
    ```

## Running the Application

### Development Environment (Prueba)

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will typically start on `http://localhost:3000`.

2.  **Accessing the App:**
    *   Web UI: Open `http://localhost:3000` in your browser.
    *   Login: Navigate to `/login`. Use the default credentials (`admin`/`admin123`).
    *   IP Phone Directory URL: `http://<YOUR_LOCAL_IP>:3000/ivoxsdir/MainMenu.xml`

### Production Environment (Productivo)

Deploying a Next.js application to run unattended in production is best done with a process manager like PM2.

1.  **Build the Application:**
    On your production server, navigate to the project directory and run:
    ```bash
    npm run build
    ```
    This command creates an optimized production build in the `.next` directory.

2.  **Install PM2 Globally (if not already installed):**
    ```bash
    sudo npm install pm2 -g
    ```

3.  **Start the Application with PM2:**
    From your project directory, run:
    ```bash
    pm2 start npm --name "teldirectory" -- run start
    ```
    *   `pm2 start npm`: Tells PM2 to run an npm script.
    *   `--name "teldirectory"`: Assigns a manageable name to your process.
    *   `-- run start`: Executes the `start` script from your `package.json` (which is `next start -p 3000`).

4.  **PM2 Management Commands:**
    *   `pm2 list`: View running processes.
    *   `pm2 logs teldirectory`: View logs for your application.
    *   `pm2 stop teldirectory`: Stop the application.
    *   `pm2 restart teldirectory`: Restart the application.
    *   `pm2 delete teldirectory`: Remove the application from PM2.

5.  **(Recommended) Setup PM2 Startup Script:**
    To ensure your application restarts automatically if the server reboots:
    ```bash
    pm2 startup
    ```
    Follow the instructions PM2 provides (usually a command to run with `sudo`). Then, save your current PM2 process list:
    ```bash
    pm2 save
    ```

6.  **Production Environment Considerations:**
    *   **Database and XML Permissions**: Ensure the user account running the PM2 process has **read and write permissions** to the project directory, including the `teldirectory.db` file and the entire `public/ivoxsdir` directory and its contents.
    *   **Firewall**: Make sure your server's firewall allows incoming TCP connections on the port the application is running on (e.g., port `3000`).
        *   Example for `ufw` (Ubuntu): `sudo ufw allow 3000/tcp`

7.  **Accessing in Production:**
    *   Web UI: `http://YOUR_SERVER_IP:3000`
    *   IP Phone Directory URL: `http://YOUR_SERVER_IP:3000/ivoxsdir/MainMenu.xml`

## Configuring for IP Phones

For IP phones to access the directory, they need to be pointed to the correct URL. The application provides a simple way to configure this:

1.  Log into the application and navigate to the **Settings** page (`/import-xml`).
2.  In the **Network & Service URL Configuration** section:
    *   Enter the **IP address** of the server where the TelDirectory application is running (e.g., `192.168.1.100`).
    *   Enter the **port** (`3000` by default).
3.  Click **"Apply Network Settings to XMLs"**. This action will automatically update all menu URLs within your XML files.
4.  Configure your IP phones or PBX to use the main directory URL: `http://<YOUR_SERVER_IP>:3000/ivoxsdir/MainMenu.xml`.
