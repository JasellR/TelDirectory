
# TelDirectory - Corporate Phone Directory

TelDirectory is a Next.js web application designed to manage and display a corporate phone directory. It reads directory data from XML files, allowing users to navigate through zones, branches (for specific zones like "Zona Metropolitana"), and localities to find phone extensions. The application also provides an interface to import and manage these XML files, a search feature, and a mechanism to sync extension names from an external XML feed. Administrative features like XML import, data modification, and settings are protected by a simple username/password authentication system backed by an SQLite database.

## Core Features:

*   **Hierarchical Directory**: Navigate through Zones, Branches (where applicable), and Localities.
*   **Extension Listing**: View department/contact names and their phone extensions. Clickable extension numbers (using `tel:` links) to initiate calls via system's default telephony app.
*   **XML-Based Data**: Directory data is stored in XML files, following Cisco IP Phone standards.
*   **Web Interface**: Browse the directory through a user-friendly web interface.
*   **Global Search**: A search bar on the homepage allows users to quickly find departments (localities) by name, or specific extensions by their name/role or number, across the entire directory.
*   **Authentication**:
    *   A login page (`/login`) protects administrative functionalities.
    *   Default administrator credentials: `admin` / `admin123` (should be changed in a real environment, specifically by setting the `ADMIN_PASSWORD` environment variable or modifying the initial seed in `src/lib/db.ts`).
    *   User data is stored in an SQLite database (`teldirectory.db`).
*   **Data Management (Authenticated Users Only)**:
    *   Import XML files for zone branches and departments via the Settings page.
    *   Add, edit, and delete zones, branches, localities, and extensions directly through the web UI.
*   **Extension Name Synchronization (Authenticated Users Only)**:
    *   Sync extension names from a custom XML feed URL (e.g., a PHP script outputting `<CiscoIPPhoneDirectory>` format). This updates the names in your local department XML files based on matching extension numbers.
*   **Customization**:
    *   Dark Mode support (toggle in header and Settings).
    *   Language toggle (English/Español - toggle in header and Settings).
    *   Configurable root path for the directory data via the Settings page. The application expects the `MainMenu.xml` file to be PascalCase and structural directory names like `zonebranch`, `branch`, `department` to be in **lowercase** within this root path.

## Project Structure

*   `src/app/`: Contains the Next.js App Router pages.
    *   `src/app/[zoneId]/...`: Dynamic routes for displaying zone, branch, and locality pages.
    *   `src/app/import-xml/`: Page for settings, XML import, and application configuration (protected).
    *   `src/app/login/`: Login page.
*   `src/components/`: Reusable React components.
*   `src/lib/`: Core logic, data fetching utilities (`data.ts`), server actions (`actions.ts`), configuration management (`config.ts`), authentication (`auth-actions.ts`), and database (`db.ts`).
*   `src/context/`: React context for language management.
*   `src/hooks/`: Custom React hooks.
*   `src/locales/`: JSON files for internationalization (i18n).
*   `src/middleware.ts`: Handles route protection for authenticated areas.
*   `ivoxsdir/` (Default location, configurable via Settings): **Crucial directory** for storing all XML data.
    *   `ivoxsdir/MainMenu.xml`: The root XML file for the directory structure (ensure this filename is PascalCase: `MainMenu.xml`).
    *   `ivoxsdir/zonebranch/`: Contains XML files for each zone (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`) (ensure this directory name is lowercase: `zonebranch`).
    *   `ivoxsdir/branch/`: Contains XML files for branches, primarily used by Zona Metropolitana (e.g., `AdmCorporativo.xml`) (ensure this directory name is lowercase: `branch`).
    *   `ivoxsdir/department/`: Contains XML files for each locality/department, listing extensions (e.g., `Bavaro.xml`) (ensure this directory name is lowercase: `department`).
*   `.config/directory.config.json`: Stores the custom path to the `ivoxsdir` data if specified in Settings.
*   `teldirectory.db`: SQLite database file created in the project root (should be added to `.gitignore`). Stores user credentials.
*   `public/`: Static assets.

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

### 3. `ivoxsdir` Directory Setup

The application relies on XML files for its directory data. By default, it looks for a directory named `ivoxsdir` (all lowercase) at the root of your project. You can change this path via the application's Settings page (after logging in).

*   **Create the `ivoxsdir` directory** (or your custom named directory) at the root of your project or at your chosen custom location.
*   Inside `ivoxsdir`, create the following subdirectories **using lowercase names**:
    *   `zonebranch`
    *   `branch`
    *   `department`
*   **Populate with XML files**:
    *   Place your `MainMenu.xml` file (ensure filename is PascalCase: `MainMenu.xml`) in the `ivoxsdir` directory.
    *   Place your zone-specific XML files (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`) in `ivoxsdir/zonebranch/`.
    *   Place your branch-specific XML files (e.g., for Zona Metropolitana's sub-menus like `AdmCendis.xml`) in `ivoxsdir/branch/`.
    *   Place your department/locality XML files (listing extensions) in `ivoxsdir/department/`.

    *The application includes sample XML files in the `IVOXS` directory in the initial project structure. You should rename this to `ivoxsdir` (or your custom name), ensure the structural subdirectories (`zonebranch`, `branch`, `department`) are lowercase and `MainMenu.xml` is PascalCase, and replace these with your actual directory data.*

### 4. Database Setup (SQLite)

*   The application uses an SQLite database (`teldirectory.db`) to store user credentials.
*   This file will be **automatically created in your project root** the first time you run the application.
*   An initial administrator user will be seeded with credentials:
    *   Username: `admin`
    *   Password: `admin123`
    **It is strongly recommended to change this password in a real environment.** (Currently, changing the password requires direct database modification or implementing a password change feature.)
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
    The application will typically start on `http://localhost:3000` (port configured in `package.json`).

2.  **Accessing the App:**
    *   Web UI: Open `http://localhost:3000` in your browser.
    *   Login: Navigate to `/login` or attempt to access the Settings page (`/import-xml`) to be redirected. Use the default credentials (`admin`/`admin123`) or any other users you add to the database.
    *   Access administrative features via the Settings page or through UI elements that appear after login.

3.  **Data Management:**
    *   The application reads XML files from the configured `ivoxsdir` path.
    *   Any changes made via the UI (adding/editing/deleting items) will directly modify these XML files, provided the application has write permissions to the `ivoxsdir` directory and its contents.

### Production Environment (Productivo)

1.  **Build the Application:**
    ```bash
    npm run build
    ```
    This command creates an optimized production build in the `.next` directory.

2.  **Start the Production Server:**
    ```bash
    npm run start
    ```
    The application will start on port `3000` (as configured in `package.json`).

3.  **Deployment Considerations:**
    *   **`ivoxsdir` Directory**: The `ivoxsdir` directory (with all its XML files and correct casing for subfolders: `zonebranch`, `branch`, `department` as lowercase, and `MainMenu.xml` as PascalCase) **must be present at the location specified in the application's settings** (or at the project root if using the default). The application reads these files at runtime. If you configured a custom absolute path in settings, ensure that path is accessible to the production server process and the user running the Node.js process has read and **write permissions** to this directory and its contents if you intend to use the UI for modifications.
    *   **`teldirectory.db` Database File**:
        *   Ensure the `teldirectory.db` file is present in the project root or the location where the application expects it.
        *   The user running the Node.js process **must have read and write permissions** to this database file and its directory to allow for login and potential future user management features.
    *   **Environment Variables**: For improved security, consider setting the `ADMIN_PASSWORD` via an environment variable if you modify the code to read it, instead of relying on the hardcoded default or database seed. (Currently, passwords are not managed via environment variables after the initial seed).
    *   **Firewall**: Make sure your server's firewall allows incoming connections on the port the application is running on (e.g., port 3000).
    *   **Process Manager**: For long-running production deployments, use a process manager like PM2.
        ```bash
        pm2 start npm --name "teldirectory" -- run start
        ```

4.  **Accessing in Production:**
    *   Web UI: `http://YOUR_SERVER_IP_OR_DOMAIN:3000`

## Using the Import Feature (Authenticated Users)

The "Settings" page (`/import-xml`), accessible after logging in, allows users to upload XML files directly:

*   **Import Zone Branch XML**: Upload XML files for specific zones (e.g., `ZonaEste.xml`). These will be saved to `[ivoxsdir_root]/zonebranch/`. The filename (without `.xml`) is used as the ID.
*   **Import Department XML Files**: Upload XML files for departments/localities (e.g., `Bavaro.xml`). These will be saved to `[ivoxsdir_root]/department/`. The filename (without `.xml`) is used as the ID.

**Caution**: Importing files will overwrite existing files with the same name in the target directory.

## Synchronize Extension Names (Authenticated Users)

The "Settings" page also provides a feature to synchronize extension names from an external XML feed:
*   **XML Feed URL**: Enter the URL of a script (e.g., a PHP script) that outputs an XML file in the `<CiscoIPPhoneDirectory>` format (similar to a department file, containing `<DirectoryEntry>` with `<Name>` and `<Telephone>`).
*   **Sync Action**: Clicking "Sync Names from Feed" will fetch this external XML. For each extension number found in the feed, the application will check your local `department` XML files. If an extension with the same number exists locally but has a different name, the local name will be updated to match the name from the feed.

## Search Functionality

*   **Global Search (Homepage)**: The homepage features a prominent search bar. Users can type to search for:
    *   Department/Locality names.
    *   Extension names/roles (e.g., "Sales CAJ1", "John Doe").
    *   Extension numbers.
    Search results will display matching localities, highlighting the part that matched (locality name or specific extension details), and provide a direct link to the locality's page.

*   **Zone-Specific Search**: Each zone page features a search bar that allows users to quickly find localities or branches (if applicable, like in Zona Metropolitana) within that specific zone by name or ID.

## XML Structure

The application reads and writes XML data structured for Cisco IP Phones:

*   **Menu Structure (`CiscoIPPhoneMenu`)**: Used for `MainMenu.xml`, `zonebranch/*.xml`, and `branch/*.xml`. Contains `<MenuItem>` elements with `<Name>` and `<URL>`.
*   **Directory Structure (`CiscoIPPhoneDirectory`)**: Used for `department/*.xml`. Contains `<DirectoryEntry>` elements with `<Name>` (department/contact) and `<Telephone>` (extension).

Refer to Cisco IP Phone documentation for detailed XML specifications if needed.
