# TelDirectory - Corporate Phone Directory

TelDirectory is a Next.js web application designed to manage and display a corporate phone directory, primarily for use with Cisco IP phones. It reads directory data from XML files, allowing users to navigate through zones, branches (for specific zones like "Zona Metropolitana"), and localities to find phone extensions. The application also provides an interface to import and manage these XML files.

## Core Features:

*   **Hierarchical Directory**: Navigate through Zones, Branches (where applicable), and Localities.
*   **Extension Listing**: View department/contact names and their phone extensions.
*   **XML-Based Data**: Directory data is stored in XML files, following Cisco IP Phone standards.
*   **Web Interface**: Browse the directory through a user-friendly web interface.
*   **IP Phone Service**: Serves XML data to Cisco IP phones via specific URL endpoints.
*   **Data Management**:
    *   Import XML files for zones, branches, and departments.
    *   Add, edit, and delete zones, branches, localities, and extensions directly through the web UI.
*   **Customization**:
    *   Dark Mode support.
    *   Language toggle (English/Español).

## Project Structure

*   `src/app/`: Contains the Next.js App Router pages and API routes.
    *   `src/app/[zoneId]/...`: Dynamic routes for displaying zone, branch, and locality pages.
    *   `src/app/ivoxsdir/...`: API routes that serve XML content to IP phones.
    *   `src/app/import-xml/`: Page for settings, XML import, and application configuration.
*   `src/components/`: Reusable React components.
*   `src/lib/`: Core logic, data fetching utilities (`data.ts`), and server actions (`actions.ts`).
*   `src/context/`: React context for language management.
*   `src/hooks/`: Custom React hooks.
*   `src/locales/`: JSON files for internationalization (i18n).
*   `IVOXS/`: **Crucial directory** for storing all XML data.
    *   `IVOXS/MAINMENU.xml`: The root XML file for the IP phone directory service.
    *   `IVOXS/ZoneBranch/`: Contains XML files for each zone (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`).
    *   `IVOXS/Branch/`: Contains XML files for branches, primarily used by Zona Metropolitana (e.g., `AdmCorporativo.xml`).
    *   `IVOXS/Department/`: Contains XML files for each locality/department, listing extensions (e.g., `Bavaro.xml`, `ContabilidadGeneral.xml`).
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

### 3. IVOXS Directory Setup

The application relies on XML files located in the `IVOXS` directory at the root of the project.

*   **Create the `IVOXS` directory** at the root of your project if it doesn't exist.
*   Inside `IVOXS`, create the following subdirectories:
    *   `ZoneBranch`
    *   `Branch`
    *   `Department`
*   **Populate with XML files**:
    *   Place your `MAINMENU.xml` file in the `IVOXS` directory.
    *   Place your zone-specific XML files (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`) in `IVOXS/ZoneBranch/`.
    *   Place your branch-specific XML files (e.g., for Zona Metropolitana's sub-menus like `AdmCendis.xml`) in `IVOXS/Branch/`.
    *   Place your department/locality XML files (listing extensions) in `IVOXS/Department/`.

    **Example `MAINMENU.xml` content:**
    ```xml
    <?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <CiscoIPPhoneMenu>
      <Title>Farmacia Carol</Title>
      <Prompt>Select a Zone Branch</Prompt>
      <MenuItem>
        <Name>Zona Este</Name>
        <URL>http://YOUR_DEVICE_IP:PORT/ivoxsdir/zonebranch/ZonaEste.xml</URL>
      </MenuItem>
      <!-- Add other zones similarly -->
    </CiscoIPPhoneMenu>
    ```
    **Important**: Replace `YOUR_DEVICE_IP:PORT` in your XML files with the actual IP address and port where the TelDirectory application will be running and accessible to your IP phones.

    *The application includes sample XML files in the `IVOXS` directory. You should replace these with your actual directory data.*

## Running the Application

### Development Environment (Prueba)

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will typically start on `http://localhost:9002`.

2.  **Accessing the App:**
    *   Web UI: Open `http://localhost:9002` in your browser.
    *   IP Phone Service URL: `http://YOUR_COMPUTER_IP:9002/ivoxsdir/mainmenu.xml` (replace `YOUR_COMPUTER_IP` with your computer's actual IP address on the network accessible by the IP phones).

3.  **Data Management:**
    *   In development, the application reads XML files directly from the `IVOXS` directory. Any changes made via the UI (adding/editing/deleting items) will directly modify these local XML files.
    *   You can also manually edit the XML files in the `IVOXS` directory, and the changes will be reflected in the application after a page refresh or revalidation.

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
    The application will typically start on `http://localhost:3000` by default, but this can be configured (e.g., using environment variables or a process manager like PM2).

3.  **Deployment Considerations:**
    *   **IVOXS Directory**: The `IVOXS` directory (with all its XML files) **must be present in the same location as the `.next` folder and `package.json`** on your production server. The application reads these files at runtime when serving requests or performing actions.
    *   **IP Address/Hostname**: Ensure that the URLs within your `MAINMENU.xml` and other XML files (especially those in `IVOXS/ZoneBranch/` and `IVOXS/Branch/`) point to the correct public IP address or hostname and port of your production server. For example, if your server's IP is `192.168.1.100` and it's running on port `3000`, the URL in `MAINMENU.xml` should be `http://192.168.1.100:3000/ivoxsdir/mainmenu.xml`.
    *   **Firewall**: Make sure your server's firewall allows incoming connections on the port the application is running on (e.g., port 3000) from the network where your IP phones are located.
    *   **Process Manager**: For long-running production deployments, use a process manager like PM2 to manage the Next.js application.
        ```bash
        pm2 start npm --name "teldirectory" -- run start
        ```

4.  **Accessing in Production:**
    *   Web UI: `http://YOUR_SERVER_IP:PORT`
    *   IP Phone Service URL: `http://YOUR_SERVER_IP:PORT/ivoxsdir/mainmenu.xml`

## Using the Import Feature

The "Settings" page (`/import-xml`) allows you to upload XML files directly:

*   **Import Zone Branch XML**: Upload XML files for specific zones (e.g., `ZonaEste.xml`). These will be saved to `IVOXS/ZoneBranch/`. The filename (without `.xml`) is used as the ID.
*   **Import Department XML Files**: Upload XML files for departments/localities (e.g., `Bavaro.xml`). These will be saved to `IVOXS/Department/`. The filename (without `.xml`) is used as the ID.

**Caution**: Importing files will overwrite existing files with the same name in the target directory.

## XML Structure for IP Phones

The application serves XML data structured for Cisco IP Phones:

*   **Menu Structure (`CiscoIPPhoneMenu`)**: Used for `MAINMENU.xml`, `ZoneBranch/*.xml`, and `Branch/*.xml`. Contains `<MenuItem>` elements with `<Name>` and `<URL>`.
*   **Directory Structure (`CiscoIPPhoneDirectory`)**: Used for `Department/*.xml`. Contains `<DirectoryEntry>` elements with `<Name>` (department/contact) and `<Telephone>` (extension).

Refer to Cisco IP Phone documentation for detailed XML specifications if needed.
```